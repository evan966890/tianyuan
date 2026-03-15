#!/bin/bash

# 飞书文档读取脚本 - 支持多种文档类型
# 用法: ./read_doc.sh <doc_token> [doc|sheet|docx|bitable|wiki]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 配置文件路径
CONFIG_FILE="./reference/feishu_config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    CONFIG_FILE="$SCRIPT_DIR/../reference/feishu_config.json"
fi

# 验证配置文件存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "错误: 配置文件不存在" >&2
    echo "请创建配置文件 ./reference/feishu_config.json，格式如下:" >&2
    echo '{' >&2
    echo '  "app_id": "your_app_id_here",' >&2
    echo '  "app_secret": "your_app_secret_here"' >&2
    echo '}' >&2
    exit 1
fi

# 参数验证
if [ $# -lt 1 ]; then
    echo "用法: $0 <document_token> [类型]" >&2
    echo "" >&2
    echo "支持的文档类型:" >&2
    echo "  docx     新版飞书文档 (token前缀: docx_)" >&2
    echo "  doc      旧版飞书文档 (token前缀: doc_)" >&2
    echo "  sheet    电子表格 (token前缀: sheet_, shtcn)" >&2
    echo "  bitable  多维表格 (token前缀: base, bascn)" >&2
    echo "  wiki     知识库节点 (token前缀: wikcn)" >&2
    echo "" >&2
    echo "示例:" >&2
    echo "  $0 docx_xxxxxxxxxxxxxxx          # 自动识别为新版文档" >&2
    echo "  $0 sheet_xxxxxxxxxxxxxxx         # 自动识别为表格" >&2
    echo "  $0 basexxxxxxxxxxxxxxx bitable   # 指定为多维表格" >&2
    echo "  $0 wikcnxxxxxxxxxxxxxxx wiki     # 指定为知识库" >&2
    exit 1
fi

DOC_TOKEN=$1
DOC_TYPE=${2:-auto}

# 使用统一读取器
if [ -f "$SCRIPT_DIR/feishu_reader.py" ]; then
    if [ "$DOC_TYPE" = "auto" ]; then
        python3 "$SCRIPT_DIR/feishu_reader.py" "$DOC_TOKEN" --pretty
    else
        python3 "$SCRIPT_DIR/feishu_reader.py" "$DOC_TOKEN" --type "$DOC_TYPE" --pretty
    fi
else
    # 向后兼容：使用旧版脚本
    echo "正在读取飞书文档: $DOC_TOKEN" >&2
    python3 "$SCRIPT_DIR/read_feishu_doc.py" "$DOC_TOKEN"
fi