#!/bin/bash

# 飞书统一文档读取器 - Shell包装脚本
# 支持: docx, doc, sheet, bitable, wiki
# 用法: ./read_feishu.sh <token_or_url> [选项]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/feishu_reader.py"

# 显示帮助信息
show_help() {
    cat << EOF
飞书统一文档读取器

用法:
  $0 <token_or_url> [选项]

支持的文档类型:
  docx      新版飞书文档 (token前缀: docx_)
  doc       旧版飞书文档 (token前缀: doc_)
  sheet     电子表格 (token前缀: sheet_, shtcn)
  bitable   多维表格 (token前缀: base, bascn)
  wiki      知识库节点 (token前缀: wikcn)

选项:
  -t, --type TYPE     指定文档类型 (默认自动检测)
  -o, --output FORMAT 输出格式: json 或 text (默认: json)
  -p, --pretty        格式化JSON输出
  -r, --recursive     递归读取Wiki子节点
  --wiki-space ID     读取整个知识空间
  -h, --help          显示此帮助信息

示例:
  # 自动检测并读取文档
  $0 docx_AbCdEfGhIjKlMnOp
  
  # 读取电子表格
  $0 sheet_XyZ123AbCdEfGh --type sheet
  
  # 读取多维表格
  $0 baseAbCdEfGhIjKlMn --type bitable
  
  # 读取Wiki知识库节点
  $0 wikcnAbCdEfGhIjKl --type wiki
  
  # 从URL读取
  $0 "https://xxx.feishu.cn/docx/xxxxx"
  
  # 读取整个知识空间
  $0 --wiki-space SPACE_ID --recursive
  
  # 格式化输出
  $0 docx_xxxxx --pretty
  
  # 只输出文本内容
  $0 docx_xxxxx --output text

EOF
}

# 检查Python脚本是否存在
if [ ! -f "$PYTHON_SCRIPT" ]; then
    echo "错误: Python脚本不存在: $PYTHON_SCRIPT" >&2
    exit 1
fi

# 解析参数
ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            ARGS+=("$1")
            shift
            ;;
    esac
done

# 如果没有参数，显示帮助
if [ ${#ARGS[@]} -eq 0 ]; then
    show_help
    exit 1
fi

# 执行Python脚本
python3 "$PYTHON_SCRIPT" "${ARGS[@]}"
