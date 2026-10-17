#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

type ToolArguments = Record<string, unknown>;

function requireString(args: ToolArguments, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, `${name} must be a non-empty string`);
  }
  return value;
}

function optionalString(args: ToolArguments, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, `${name} must be a string`);
  }
  return value;
}

function requireStringArray(args: ToolArguments, name: string): string[] {
  const value = args[name];
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === 'string')) {
    throw new McpError(ErrorCode.InvalidParams, `${name} must be a non-empty array of strings`);
  }
  return value;
}

class PDFcoServer {
  private server: Server;
  private apiKey: string;
  private baseUrl = 'https://api.pdf.co/v1';

  constructor() {
    this.apiKey = process.env.PDFCO_API_KEY || '';
    
    this.server = new Server(
      {
        name: 'pdf-co-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async makeApiCall(endpoint: string, data: any) {
    try {
      const response = await axios.post(
        `${this.baseUrl}${endpoint}`,
        { ...data, async: false },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.error) {
        throw new Error(response.data.message || 'API request failed');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API call failed: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'pdf_merge',
          description: 'Merge multiple PDF files into a single PDF',
          inputSchema: {
            type: 'object',
            properties: {
              urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of URLs to PDF files to merge',
              },
            },
            required: ['urls'],
          },
        },
        {
          name: 'pdf_split',
          description: 'Split PDF into individual pages',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the PDF file to split',
              },
              pages: {
                type: 'string',
                description: 'Page numbers (e.g., "1,3,5-7")',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'pdf_to_text',
          description: 'Extract text content from PDF',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the PDF file',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'pdf_to_json',
          description: 'Convert PDF to JSON format',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the PDF file',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'html_to_pdf',
          description: 'Convert HTML to PDF',
          inputSchema: {
            type: 'object',
            properties: {
              html: {
                type: 'string',
                description: 'HTML content to convert',
              },
              url: {
                type: 'string',
                description: 'URL to convert',
              },
            },
          },
        },
        {
          name: 'get_credits_balance',
          description: 'Get API credits balance',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.apiKey) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'PDFCO_API_KEY environment variable is not set'
        );
      }

      try {
        const { name } = request.params;
        const args = (request.params.arguments ?? {}) as ToolArguments;
        let result;

        switch (name) {
          case 'pdf_merge': {
            const urls = requireStringArray(args, 'urls');
            result = await this.makeApiCall('/pdf/merge', {
              url: urls.join(','),
              name: 'merged.pdf',
            });
            return {
              content: [{
                type: 'text',
                text: `PDFs merged successfully!\nOutput URL: ${result.url}`,
              }],
            };
          }

          case 'pdf_split': {
            const url = requireString(args, 'url');
            const pages = optionalString(args, 'pages');
            result = await this.makeApiCall('/pdf/split', {
              url,
              pages: pages || '',
            });
            return {
              content: [{
                type: 'text',
                text: `PDF split successfully!\nOutput URLs:\n${result.urls.join('\n')}`,
              }],
            };
          }

          case 'pdf_to_text': {
            result = await this.makeApiCall('/pdf/convert/to/text', {
              url: requireString(args, 'url'),
              inline: true,
            });
            return {
              content: [{
                type: 'text',
                text: result.body || result.text || 'No text extracted',
              }],
            };
          }

          case 'pdf_to_json': {
            result = await this.makeApiCall('/pdf/convert/to/json', {
              url: requireString(args, 'url'),
              inline: true,
            });
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result.body || result, null, 2),
              }],
            };
          }

          case 'html_to_pdf': {
            const data: any = { name: 'output.pdf' };
            const html = optionalString(args, 'html');
            const url = optionalString(args, 'url');
            if (html) data.html = html;
            else if (url) data.url = url;
            else throw new McpError(ErrorCode.InvalidParams, 'Either html or url must be provided');

            result = await this.makeApiCall('/pdf/convert/from/html', data);
            return {
              content: [{
                type: 'text',
                text: `PDF created successfully!\nOutput URL: ${result.url}`,
              }],
            };
          }

          case 'get_credits_balance': {
            const response = await axios.get(
              `${this.baseUrl}/account/balance`,
              { headers: { 'x-api-key': this.apiKey } }
            );
            return {
              content: [{
                type: 'text',
                text: `API Credits Balance:\nAvailable: ${response.data.AvailableCredits}\nUsed: ${response.data.UsedCredits}`,
              }],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(
          ErrorCode.InternalError,
          `PDF.co API error: ${errorMessage}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('PDF.co MCP server running on stdio');
  }
}

const server = new PDFcoServer();
server.run().catch(console.error);
