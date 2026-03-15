#!/bin/bash

# Feishu Document Blocks Reader - Shell wrapper
# Usage: ./get_blocks.sh <document_token>
# 
# 此脚本专门用于获取docx/doc文档的blocks结构
# 如需读取其他类型文档，请使用 read_feishu.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/get_feishu_doc_blocks.py"

if [ $# -lt 1 ]; then
    echo "用法: $0 <document_token>"
    echo ""
    echo "获取飞书文档的完整blocks结构"
    echo ""
    echo "示例:"
    echo "  $0 docx_AbCdEfGhIjKlMnOpQrStUv"
    echo "  $0 doc_AbCdEfGhIjKlMnOpQrStUv"
    echo ""
    echo "提示: 如需读取其他类型文档(sheet/bitable/wiki)，请使用:"
    echo "  ./read_feishu.sh <token> --type <type>"
    exit 1
fi

DOC_TOKEN="$1"

# Validate document token format
if [[ ! "$DOC_TOKEN" =~ ^(docx_|doc_)[a-zA-Z0-9]+$ ]]; then
    echo "警告: 文档token格式可能无效" >&2
    echo "期望格式: docx_xxxxx 或 doc_xxxxx" >&2
    echo "如需读取其他类型，请使用 read_feishu.sh" >&2
fi

# Check if Python script exists
if [ ! -f "$PYTHON_SCRIPT" ]; then
    echo "错误: Python脚本不存在: $PYTHON_SCRIPT" >&2
    exit 1
fi

# Execute the Python script
python3 "$PYTHON_SCRIPT" "$DOC_TOKEN"