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
        const { name, arguments: args } = request.params;
        let result;

        switch (name) {
          case 'pdf_merge':
            result = await this.makeApiCall('/pdf/merge', {
              url: args.urls.join(','),
              name: 'merged.pdf',
            });
            return {
              content: [{
                type: 'text',
                text: `PDFs merged successfully!\nOutput URL: ${result.url}`,
              }],
            };

          case 'pdf_split':
            result = await this.makeApiCall('/pdf/split', {
              url: args.url,
              pages: args.pages || '',
            });
            return {
              content: [{
                type: 'text',
                text: `PDF split successfully!\nOutput URLs:\n${result.urls.join('\n')}`,
              }],
            };

          case 'pdf_to_text':
            result = await this.makeApiCall('/pdf/convert/to/text', {
              url: args.url,
              inline: true,
            });
            return {
              content: [{
                type: 'text',
                text: result.body || result.text || 'No text extracted',
              }],
            };

          case 'pdf_to_json':
            result = await this.makeApiCall('/pdf/convert/to/json', {
              url: args.url,
              inline: true,
            });
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result.body || result, null, 2),
              }],
            };

          case 'html_to_pdf':
            const data: any = { name: 'output.pdf' };
            if (args.html) data.html = args.html;
            else if (args.url) data.url = args.url;
            else throw new Error('Either html or url must be provided');

            result = await this.makeApiCall('/pdf/convert/from/html', data);
            return {
              content: [{
                type: 'text',
                text: `PDF created successfully!\nOutput URL: ${result.url}`,
              }],
            };

          case 'get_credits_balance':
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
