---
name: feishu-doc-reader
description: Read and extract content from all Feishu (Lark) document types using the official Feishu Open API
metadata: {"moltbot":{"emoji":"📄","requires":{"bins":["python3","curl"]}}}
---

# Feishu Document Reader

This skill enables reading and extracting content from all Feishu (Lark) document types using the official Feishu Open API.

## Configuration

### Set Up the Skill

1. Create the configuration file at `./reference/feishu_config.json` with your Feishu app credentials:

```json
{
  "app_id": "your_feishu_app_id_here",
  "app_secret": "your_feishu_app_secret_here"
}
```

2. Make sure the scripts are executable:
```bash
chmod +x scripts/read_doc.sh
chmod +x scripts/read_feishu.sh
chmod +x scripts/get_blocks.sh
```

**Security Note**: The configuration file should be kept secure and not committed to version control. Consider using proper file permissions (`chmod 600 ./reference/feishu_config.json`).

## Usage

### Unified Document Reader (推荐)

使用统一文档读取器可以自动识别并读取所有支持的文档类型：

```bash
# 自动识别文档类型并读取
./scripts/read_feishu.sh "docx_xxxxxxxxxxxxxx"
./scripts/read_feishu.sh "sheet_xxxxxxxxxxxxx"
./scripts/read_feishu.sh "basexxxxxxxxxxxxxx"
./scripts/read_feishu.sh "wikcnxxxxxxxxxxxxx"

# 从URL直接读取
./scripts/read_feishu.sh "https://xxx.feishu.cn/docx/xxxxx"

# 指定文档类型
./scripts/read_feishu.sh "token" --type bitable

# 格式化JSON输出
./scripts/read_feishu.sh "token" --pretty

# 只输出文本内容
./scripts/read_feishu.sh "docx_token" --output text
```

### Wiki Knowledge Base (知识库)

读取飞书知识库节点和内容：

```bash
# 读取单个Wiki节点
./scripts/read_feishu.sh "wikcnxxxxxxxxxxxxxx" --type wiki

# 读取整个知识空间
./scripts/read_feishu.sh --wiki-space "SPACE_ID"

# 递归读取所有子节点内容
./scripts/read_feishu.sh --wiki-space "SPACE_ID" --recursive
```

### Bitable (多维表格)

读取飞书多维表格数据：

```bash
# 读取多维表格（包含所有数据表和记录）
./scripts/read_feishu.sh "basexxxxxxxxxxxxxx" --type bitable
```

### Basic Document Reading

```bash
# 读取新版文档
./scripts/read_doc.sh "docx_xxxxxxxxxxxxxx"

# 读取电子表格
./scripts/read_doc.sh "sheet_xxxxxxxxxxxxx" sheet

# 读取多维表格
./scripts/read_doc.sh "basexxxxxxxxxxxxxx" bitable

# 读取知识库节点
./scripts/read_doc.sh "wikcnxxxxxxxxxxxxx" wiki
```

### Get Detailed Document Blocks

For complete document structure with all blocks:

```bash
# Get full document blocks structure
./scripts/get_blocks.sh "docx_AbCdEfGhIjKlMnOpQrStUv"
```

**Using Python directly:**
```bash
python scripts/feishu_reader.py "docx_token" --pretty
python scripts/feishu_reader.py "sheet_token" --type sheet
python scripts/feishu_reader.py --wiki-space "SPACE_ID" --recursive
```

### Supported Document Types

| 类型 | Token前缀 | 说明 | 支持程度 |
|------|----------|------|---------|
| **docx** | `docx_` | 新版飞书文档 | ✅ 完整支持 |
| **doc** | `doc_` | 旧版飞书文档 | ✅ 基本支持 |
| **sheet** | `sheet_`, `shtcn` | 电子表格 | ✅ 完整支持 |
| **bitable** | `base`, `bascn` | 多维表格 | ✅ 完整支持 |
| **wiki** | `wikcn` | 知识库节点 | ✅ 完整支持 |
| **slides** | - | 幻灯片 | ⚠️ 仅元数据 |

## Features

### Enhanced Content Extraction
- **Structured output**: Clean JSON with document metadata, content blocks, and hierarchy
- **Complete blocks access**: Full access to all document blocks including text, tables, images, headings, lists, etc.
- **Block hierarchy**: Proper parent-child relationships between blocks
- **Text extraction**: Automatic text extraction from complex block structures
- **Table support**: Proper table parsing with row/column structure
- **Image handling**: Image URLs and metadata extraction
- **Link resolution**: Internal and external link extraction

### Block Types Supported
- **text**: Plain text and rich text content
- **heading1/2/3**: Document headings with proper hierarchy
- **bullet/ordered**: List items with nesting support
- **table**: Complete table structures with cells and formatting
- **image**: Image blocks with tokens and metadata
- **quote**: Block quotes
- **code**: Code blocks with language detection
- **equation**: Mathematical equations
- **divider**: Horizontal dividers
- **page**: Page breaks (in multi-page documents)

### Error Handling & Diagnostics
- **Detailed error messages**: Clear explanations for common issues
- **Permission validation**: Checks required permissions before making requests
- **Token validation**: Validates document tokens before processing
- **Retry logic**: Automatic retries for transient network errors
- **Rate limiting**: Handles API rate limits gracefully

### Security Features
- **Secure credential storage**: Supports both environment variables and secure file storage
- **No credential logging**: Credentials never appear in logs or output
- **Minimal permissions**: Uses only required API permissions
- **Access token caching**: Efficient token reuse to minimize API calls

## Command Line Options

### Main Document Reader
```bash
# Python script options
python scripts/read_feishu_doc.py --help

# Shell script usage
./scripts/read_doc.sh <doc_token> [doc|sheet|slide]
```

### Blocks Reader (NEW)
```bash
# Get full document blocks
./scripts/get_blocks.sh <doc_token>

# Get specific block
./scripts/get_blocks.sh <doc_token> <block_id>

# Include children blocks
./scripts/get_blocks.sh <doc_token> "" true

# Python options
python scripts/get_feishu_doc_blocks.py --help
```

## API Permissions Required

Your Feishu app needs the following permissions based on document types:

### 基础权限（必需）
- `docx:document:readonly` - 读取新版文档内容
- `doc:document:readonly` - 读取旧版文档内容

### 电子表格
- `sheets:spreadsheet:readonly` - 读取电子表格内容

### 多维表格 (Bitable)
- `bitable:app:readonly` - 读取多维表格元信息
- `bitable:record:read` - 读取多维表格记录

### 知识库 (Wiki)
- `wiki:wiki:readonly` - 读取知识库节点信息

### 云空间（可选）
- `drive:drive:readonly` - 读取云空间文件信息

## Error Handling

Common errors and solutions:

### 认证错误
- **401 Unauthorized**: 检查 App ID 和 App Secret 是否正确
- **Token expired**: 访问令牌2小时过期，会自动刷新

### 权限错误
- **403 Forbidden**: 检查应用权限配置和文档共享设置
- **99991663**: 应用没有访问该文档的权限
- **10002**: 应用权限不足，请在开放平台配置所需权限

### 资源错误
- **404 Not Found**: 检查文档token是否正确
- **99991664**: 文档不存在或已被删除

### 特定类型错误
- **Wiki节点无法读取**: 检查 `wiki:wiki:readonly` 权限
- **Bitable记录为空**: 检查 `bitable:record:read` 权限
- **Sheet数据缺失**: 检查工作表是否有数据，权限是否足够

## Examples

### 读取各类文档

```bash
# 新版文档 (docx)
./scripts/read_feishu.sh "docx_AbCdEfGhIjKlMnOp" --pretty

# 电子表格 (sheet)
./scripts/read_feishu.sh "sheet_XyZ123AbCdEfGh" --type sheet

# 多维表格 (bitable)
./scripts/read_feishu.sh "baseAbCdEfGhIjKlMn" --type bitable --pretty

# 知识库节点 (wiki)
./scripts/read_feishu.sh "wikcnAbCdEfGhIjKl" --type wiki
```

### 知识库操作

```bash
# 读取单个节点及其内容
./scripts/read_feishu.sh "wikcnAbCdEfGhIjKl" --type wiki --pretty

# 读取整个知识空间
./scripts/read_feishu.sh --wiki-space "7xxxxxxxxxx" --pretty

# 递归读取知识空间所有内容
./scripts/read_feishu.sh --wiki-space "7xxxxxxxxxx" --recursive
```

### 从URL读取

```bash
# 直接从飞书URL读取（自动识别类型）
./scripts/read_feishu.sh "https://xxx.feishu.cn/docx/xxxxx"
./scripts/read_feishu.sh "https://xxx.feishu.cn/wiki/xxxxx"
./scripts/read_feishu.sh "https://xxx.feishu.cn/base/xxxxx"
```

### 输出格式控制

```bash
# JSON格式（默认）
./scripts/read_feishu.sh "docx_token"

# 格式化JSON
./scripts/read_feishu.sh "docx_token" --pretty

# 仅输出纯文本
./scripts/read_feishu.sh "docx_token" --output text
```

### Python直接调用

```bash
# 统一读取器
python scripts/feishu_reader.py "docx_token" --pretty
python scripts/feishu_reader.py "base_token" --type bitable
python scripts/feishu_reader.py --wiki-space "SPACE_ID" --recursive

# 文档blocks专用
python scripts/get_feishu_doc_blocks.py "docx_token"
```

## Security Notes

- **Never commit credentials**: Keep app secrets out of version control
- **Use minimal permissions**: Only request permissions your use case requires
- **Secure file permissions**: Set proper file permissions on secret files (`chmod 600`)
- **Environment isolation**: Use separate apps for development and production
- **Audit access**: Regularly review which documents your app can access

## Troubleshooting

### Authentication Issues
1. Verify your App ID and App Secret in Feishu Open Platform
2. Ensure the app has been published with required permissions  
3. Check that environment variables or config files are properly set
4. Test with the `test_auth.py` script to verify credentials

### Document Access Issues
1. Ensure the document is shared with your app or in an accessible space
2. Verify the document token format (should start with `docx_`, `doc_`, or `sheet_`)
3. Check if the document requires additional sharing permissions

### Network Issues
1. Ensure your server can reach `open.feishu.cn`
2. Check firewall rules if running in restricted environments
3. The script includes retry logic for transient network failures

### Blocks-Specific Issues
1. **Empty blocks response**: Document might be empty or have no accessible blocks
2. **Missing block types**: Some block types require additional permissions
3. **Incomplete hierarchy**: Use `--include-children` flag for complete block tree

## References

### 官方文档
- [Feishu Open API Documentation](https://open.feishu.cn/document)
- [Authentication Guide](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)

### 文档相关
- [Document API (docx)](https://open.feishu.cn/document/server-docs/docs/docx-v1/document)
- [Blocks API Reference](https://open.feishu.cn/document/server-docs/docs/docx-v1/document-block)

### 表格相关
- [Sheet API Reference](https://open.feishu.cn/document/server-docs/docs/sheets-v3/spreadsheet/get)
- [Bitable API Reference](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app/get)
- [Bitable Records API](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/list)

### 知识库相关
- [Wiki API Overview](https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-overview)
- [Wiki Node API](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list)
- [Get Wiki Node](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/wiki-v2/space/get_node)
