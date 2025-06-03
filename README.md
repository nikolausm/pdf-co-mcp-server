# PDF.co MCP Server

MCP server for PDF.co API integration - enables AI assistants to perform PDF operations.

## Installation

```bash
# Clone and install
git clone https://github.com/nikolausm/pdf-co-mcp-server.git
cd pdf-co-mcp-server
npm install
npm run build
```

## Configuration

1. Get your API key from [PDF.co](https://app.pdf.co)

2. Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "pdf-co": {
      "command": "node",
      "args": ["/path/to/pdf-co-mcp-server/dist/index.js"],
      "env": {
        "PDFCO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

- `pdf_merge` - Merge multiple PDFs
- `pdf_split` - Split PDF pages
- `pdf_to_text` - Extract text
- `pdf_to_json` - Convert to JSON
- `html_to_pdf` - HTML to PDF
- `get_credits_balance` - Check API credits

## License

MIT