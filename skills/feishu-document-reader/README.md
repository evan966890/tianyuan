# Feishu Document Reader - 飞书文档统一读取器

全面支持飞书(Lark)各类在线文档的读取，包括文档、表格、知识库等。

## Features

- **多文档类型支持**: 
  - ✅ Docx (新版文档) - 完整blocks结构和内容
  - ✅ Doc (旧版文档) - 基本支持
  - ✅ Sheet (电子表格) - 完整数据读取
  - ✅ Bitable (多维表格) - 字段和记录完整提取
  - ✅ Wiki (知识库) - 节点信息和内容读取
- **自动类型识别**: 根据token或URL自动识别文档类型
- **统一接口**: 一个命令读取所有类型
- **安全认证**: 自动令牌管理和刷新
- **完善的错误处理**: 详细的错误信息和诊断

## Quick Start

### 1. Configuration

Create `./reference/feishu_config.json`:

```json
{
  "app_id": "your_feishu_app_id",
  "app_secret": "your_feishu_app_secret"
}
```

Set proper permissions:
```bash
chmod 600 ./reference/feishu_config.json
chmod +x scripts/*.sh
```

### 2. Usage

#### 统一读取器（推荐）:
```bash
# 自动识别文档类型
./scripts/read_feishu.sh "docx_your_document_token"
./scripts/read_feishu.sh "sheet_xxxxxxxxxxxxx"
./scripts/read_feishu.sh "basexxxxxxxxxxxxxx"
./scripts/read_feishu.sh "wikcnxxxxxxxxxxxxx"

# 从URL读取
./scripts/read_feishu.sh "https://xxx.feishu.cn/docx/xxxxx"

# 格式化输出
./scripts/read_feishu.sh "docx_token" --pretty
```

#### 读取知识库:
```bash
# 读取单个节点
./scripts/read_feishu.sh "wikcn_token" --type wiki

# 读取整个知识空间
./scripts/read_feishu.sh --wiki-space "SPACE_ID" --recursive
```

#### 读取多维表格:
```bash
./scripts/read_feishu.sh "base_token" --type bitable --pretty
```

#### Python直接调用:
```bash
python scripts/feishu_reader.py "docx_token" --pretty
python scripts/feishu_reader.py "base_token" --type bitable
python scripts/feishu_reader.py --wiki-space "SPACE_ID"
```

### 3. Output Format

输出包含以下内容（根据文档类型有所不同）:

**文档 (docx/doc)**:
- `document`: 文档元信息
- `blocks`: 完整的blocks结构
- `text_content`: 提取的纯文本

**电子表格 (sheet)**:
- `spreadsheet`: 表格元信息
- `sheets`: 各工作表数据

**多维表格 (bitable)**:
- `app`: 多维表格元信息
- `tables`: 数据表列表（含字段和记录）

**知识库 (wiki)**:
- `node`: 节点信息
- `content`: 节点实际内容
- `children`: 子节点列表

## Integration with AI Agents

This skill can be used as a standalone tool or integrated into AI agent workflows:

1. **Direct execution**: Call the script from any AI agent
2. **Extension tool**: Register as an extension for seamless document processing
3. **Pipeline integration**: Combine with other tools for advanced document analysis

## API Permissions Required

在飞书开放平台配置以下权限:

### 基础权限
- `docx:document:readonly` - 新版文档
- `doc:document:readonly` - 旧版文档

### 电子表格
- `sheets:spreadsheet:readonly` - 电子表格

### 多维表格 (Bitable)
- `bitable:app:readonly` - 多维表格元信息
- `bitable:record:read` - 多维表格记录

### 知识库 (Wiki)
- `wiki:wiki:readonly` - 知识库节点

## Security Notes

- Credentials are never logged or exposed in output
- Access tokens are cached and refreshed automatically
- File system access is restricted to prevent path traversal
- Use minimal required permissions for your use case

## Troubleshooting

### Common Issues

**Authentication Failed (401)**:
- Verify App ID and App Secret in Feishu Open Platform
- Ensure app is published with required permissions

**Document Not Found (404)**:
- Check document token format (should start with `docx_`, `doc_`, or `sheet_`)
- Ensure document is shared with your app

**Permission Denied (403)**:
- Verify required API permissions are granted
- Check if document requires additional sharing settings

### Debugging

Enable debug logging:
```bash
DEBUG=1 python scripts/get_feishu_doc_blocks.py --doc-token "your_token"
```

## Examples

See [USAGE_EXAMPLES.md](USAGE_EXAMPLES.md) for detailed examples.

## References

- [Feishu Open API Documentation](https://open.feishu.cn/document)
- [Document Blocks API](https://open.feishu.cn/document/server-docs/docs/docx-v1/document-block)
- [Authentication Guide](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)