{
  "openapi": "3.1.0",
  "info": { "title": "929 Integrator API", "version": "1.0.0" },
  "servers": [{ "url": "https://929-integrator.vercel.app" }],
  "paths": {
    "/api/scrape929": {
      "get": {
        "operationId": "scrape929",
        "parameters": [
          { "name": "url", "in": "query", "required": true, "schema": { "type": "string" }, "description": "Full 929 page URL" },
          { "name": "debug", "in": "query", "required": false, "schema": { "type": "string", "enum": ["0","1","true","false"] }, "description": "Return raw anchors for debugging" }
        ],
        "responses": {
          "200": { "description": "OK", "content": { "application/json": { "schema": { "type": "object", "properties": {}, "additionalProperties": true } } } }
        }
      }
    },
    "/api/ytTranscript": {
      "get": {
        "operationId": "ytTranscript",
        "parameters": [
          { "name": "v", "in": "query", "required": true, "schema": { "type": "string" }, "description": "YouTube video id" },
          { "name": "lang", "in": "query", "required": false, "schema": { "type": "string", "default": "he" }, "description": "Preferred language code" }
        ],
        "responses": {
          "200": { "description": "OK", "content": { "application/json": { "schema": { "type": "object", "properties": {}, "additionalProperties": true } } } }
        }
      }
    },
    "/api/extract": {
      "get": {
        "operationId": "extract",
        "parameters": [
          { "name": "url", "in": "query", "required": true, "schema": { "type": "string" }, "description": "Any allowed article URL (e.g. 929/edu/sefaria)" }
        ],
        "responses": {
          "200": { "description": "OK", "content": { "application/json": { "schema": { "type": "object", "properties": {}, "additionalProperties": true } } } }
        }
      }
    }
  },
  "components": { "schemas": {} }
}
