#!/usr/bin/env python3
"""
飞书统一文档读取器 - 支持所有主要文档类型
支持: docx (新版文档), doc (旧版), sheet (表格), wiki (知识库), bitable (多维表格)

Features:
- 自动识别文档类型
- Wiki知识库节点递归读取
- Bitable多维表格完整数据提取
- 统一的输出格式
"""

import os
import sys
import json
import re
import requests
from typing import Optional, Dict, Any, List, Tuple
import logging
from urllib.parse import urlparse, parse_qs

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


class FeishuUnifiedReader:
    """统一飞书文档读取器，支持多种文档类型"""
    
    # 文档类型常量
    TYPE_DOCX = "docx"      # 新版文档
    TYPE_DOC = "doc"        # 旧版文档
    TYPE_SHEET = "sheet"    # 电子表格
    TYPE_BITABLE = "bitable"  # 多维表格
    TYPE_WIKI = "wiki"      # 知识库节点
    TYPE_FILE = "file"      # 云空间文件
    TYPE_SLIDES = "slides"  # 幻灯片
    
    # Token前缀到类型的映射
    TOKEN_PREFIXES = {
        "docx_": TYPE_DOCX,
        "doc_": TYPE_DOC,
        "sheet_": TYPE_SHEET,
        "shtcn": TYPE_SHEET,
        "base": TYPE_BITABLE,
        "bascn": TYPE_BITABLE,
        "wikcn": TYPE_WIKI,
    }
    
    def __init__(self, app_id: str, app_secret: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.tenant_access_token = None
        self.base_url = "https://open.feishu.cn/open-apis"
        
    def get_tenant_access_token(self) -> str:
        """获取租户访问令牌"""
        if self.tenant_access_token:
            return self.tenant_access_token
            
        url = f"{self.base_url}/auth/v3/tenant_access_token/internal"
        payload = {
            "app_id": self.app_id,
            "app_secret": self.app_secret
        }
        
        try:
            response = requests.post(url, json=payload, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != 0:
                raise Exception(f"认证失败: {data.get('msg', 'Unknown error')}")
                
            self.tenant_access_token = data["tenant_access_token"]
            logger.info("成功获取访问令牌")
            return self.tenant_access_token
            
        except Exception as e:
            raise Exception(f"获取访问令牌失败: {e}")
    
    def _make_request(self, url: str, method: str = "GET", params: Dict = None, **kwargs) -> Dict[str, Any]:
        """通用请求方法"""
        token = self.get_tenant_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8"
        }
        
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=30, **kwargs)
            elif method.upper() == "POST":
                response = requests.post(url, headers=headers, params=params, timeout=30, **kwargs)
            else:
                raise ValueError(f"不支持的HTTP方法: {method}")
                
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != 0:
                error_code = data.get("code")
                msg = data.get("msg", "Unknown error")
                raise Exception(f"API调用失败: {msg} (错误码: {error_code})")
                
            return data.get("data", {})
            
        except requests.exceptions.Timeout:
            raise Exception("请求超时")
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                raise Exception("认证失败，请检查凭据")
            elif e.response.status_code == 403:
                raise Exception("权限不足，请检查应用权限配置")
            elif e.response.status_code == 404:
                raise Exception("资源未找到")
            else:
                raise Exception(f"HTTP错误: {e.response.status_code}")
    
    def detect_type(self, token_or_url: str) -> Tuple[str, str]:
        """
        检测文档类型并提取token
        返回: (doc_type, token)
        """
        # 如果是URL，提取token
        if token_or_url.startswith("http"):
            token = self._extract_token_from_url(token_or_url)
        else:
            token = token_or_url
        
        # 根据token前缀检测类型
        for prefix, doc_type in self.TOKEN_PREFIXES.items():
            if token.startswith(prefix) or prefix in token:
                return doc_type, token
        
        # 默认尝试作为docx处理
        logger.warning(f"无法识别token类型: {token}，默认使用docx")
        return self.TYPE_DOCX, token
    
    def _extract_token_from_url(self, url: str) -> str:
        """从飞书URL中提取文档token"""
        parsed = urlparse(url)
        path_parts = parsed.path.split("/")
        
        # 常见URL格式:
        # https://xxx.feishu.cn/docx/DOC_TOKEN
        # https://xxx.feishu.cn/wiki/WIKI_TOKEN
        # https://xxx.feishu.cn/sheets/SHEET_TOKEN
        # https://xxx.feishu.cn/base/BASE_TOKEN
        
        for i, part in enumerate(path_parts):
            if part in ["docx", "doc", "wiki", "sheets", "base", "file"]:
                if i + 1 < len(path_parts):
                    return path_parts[i + 1].split("?")[0]
        
        # 如果找不到，返回最后一个非空部分
        for part in reversed(path_parts):
            if part:
                return part.split("?")[0]
        
        return url
    
    def read(self, token_or_url: str, doc_type: str = None) -> Dict[str, Any]:
        """
        统一读取接口
        
        Args:
            token_or_url: 文档token或完整URL
            doc_type: 可选，指定文档类型 (docx/doc/sheet/bitable/wiki)
        
        Returns:
            包含文档内容的字典
        """
        if doc_type:
            detected_type = doc_type
            if token_or_url.startswith("http"):
                token = self._extract_token_from_url(token_or_url)
            else:
                token = token_or_url
        else:
            detected_type, token = self.detect_type(token_or_url)
        
        logger.info(f"读取文档: type={detected_type}, token={token}")
        
        # 根据类型调用对应的读取方法
        readers = {
            self.TYPE_DOCX: self._read_docx,
            self.TYPE_DOC: self._read_doc,
            self.TYPE_SHEET: self._read_sheet,
            self.TYPE_BITABLE: self._read_bitable,
            self.TYPE_WIKI: self._read_wiki,
        }
        
        reader = readers.get(detected_type)
        if not reader:
            raise Exception(f"不支持的文档类型: {detected_type}")
        
        result = reader(token)
        result["_meta"] = {
            "type": detected_type,
            "token": token,
        }
        return result
    
    # ==================== DOCX (新版文档) ====================
    
    def _read_docx(self, doc_token: str) -> Dict[str, Any]:
        """读取新版文档 (docx)"""
        # 获取文档基本信息
        doc_info = self._make_request(
            f"{self.base_url}/docx/v1/documents/{doc_token}"
        )
        
        # 获取文档blocks
        blocks_data = self._get_all_blocks(doc_token)
        
        # 提取纯文本
        text_content = self._extract_text_from_blocks(blocks_data.get("items", []))
        
        return {
            "document": doc_info.get("document", {}),
            "blocks": blocks_data.get("items", []),
            "text_content": text_content,
        }
    
    def _get_all_blocks(self, doc_token: str, page_token: str = None) -> Dict[str, Any]:
        """获取文档所有blocks（处理分页）"""
        all_items = []
        
        while True:
            params = {"page_size": 500}
            if page_token:
                params["page_token"] = page_token
            
            data = self._make_request(
                f"{self.base_url}/docx/v1/documents/{doc_token}/blocks",
                params=params
            )
            
            items = data.get("items", [])
            all_items.extend(items)
            
            if not data.get("has_more", False):
                break
            page_token = data.get("page_token")
        
        return {"items": all_items}
    
    def _extract_text_from_blocks(self, blocks: List[Dict]) -> str:
        """从blocks中提取纯文本"""
        text_parts = []
        
        for block in blocks:
            block_type = block.get("block_type", 0)
            
            # 文本类型映射
            type_handlers = {
                2: ("text", ""),           # 文本
                3: ("heading1", "# "),     # 一级标题
                4: ("heading2", "## "),    # 二级标题
                5: ("heading3", "### "),   # 三级标题
                6: ("heading4", "#### "),  # 四级标题
                9: ("bullet", "- "),       # 无序列表
                10: ("ordered", "1. "),    # 有序列表
                11: ("quote", "> "),       # 引用
                13: ("code", "```\n"),     # 代码块
            }
            
            if block_type in type_handlers:
                key, prefix = type_handlers[block_type]
                # 尝试从对应的key或text中获取内容
                content_data = block.get(key) or block.get("text") or {}
                elements = content_data.get("elements", [])
                text = self._extract_text_from_elements(elements)
                if text:
                    text_parts.append(f"{prefix}{text}")
            
            elif block_type == 23:  # 表格
                text_parts.append("[表格]")
            elif block_type == 27:  # 图片
                text_parts.append("[图片]")
        
        return "\n".join(text_parts)
    
    def _extract_text_from_elements(self, elements: List[Dict]) -> str:
        """从文本元素中提取纯文本"""
        text_parts = []
        for element in elements:
            if element.get("text_run"):
                text_parts.append(element["text_run"].get("content", ""))
            elif element.get("mention_user"):
                user = element["mention_user"]
                text_parts.append(f"@{user.get('name', 'user')}")
            elif element.get("mention_doc"):
                doc = element["mention_doc"]
                text_parts.append(f"[文档: {doc.get('title', 'doc')}]")
        return "".join(text_parts)
    
    # ==================== DOC (旧版文档) ====================
    
    def _read_doc(self, doc_token: str) -> Dict[str, Any]:
        """读取旧版文档 (doc) - 主要返回元数据"""
        # 旧版文档API获取元数据
        try:
            meta = self._make_request(
                f"{self.base_url}/doc/v2/meta/{doc_token}"
            )
            return {
                "document": meta,
                "note": "旧版文档(doc)API功能有限，建议使用新版文档(docx)"
            }
        except Exception as e:
            # 尝试作为docx读取
            logger.warning(f"读取旧版文档失败，尝试作为新版文档读取: {e}")
            return self._read_docx(doc_token)
    
    # ==================== SHEET (电子表格) ====================
    
    def _read_sheet(self, sheet_token: str) -> Dict[str, Any]:
        """读取电子表格"""
        # 获取表格元信息
        meta = self._make_request(
            f"{self.base_url}/sheets/v3/spreadsheets/{sheet_token}"
        )
        
        spreadsheet = meta.get("spreadsheet", {})
        sheets = spreadsheet.get("sheets", [])
        
        # 读取每个工作表的数据
        sheets_data = []
        for sheet in sheets:
            sheet_id = sheet.get("sheet_id")
            title = sheet.get("title", "Sheet")
            
            try:
                # 获取工作表数据
                values = self._make_request(
                    f"{self.base_url}/sheets/v2/spreadsheets/{sheet_token}/values/{sheet_id}"
                )
                sheets_data.append({
                    "sheet_id": sheet_id,
                    "title": title,
                    "properties": sheet,
                    "values": values.get("valueRange", {}).get("values", [])
                })
            except Exception as e:
                logger.warning(f"读取工作表 {title} 失败: {e}")
                sheets_data.append({
                    "sheet_id": sheet_id,
                    "title": title,
                    "properties": sheet,
                    "error": str(e)
                })
        
        return {
            "spreadsheet": {
                "title": spreadsheet.get("title", ""),
                "owner_id": spreadsheet.get("owner_id", ""),
                "sheet_count": len(sheets)
            },
            "sheets": sheets_data
        }
    
    # ==================== BITABLE (多维表格) ====================
    
    def _read_bitable(self, app_token: str) -> Dict[str, Any]:
        """读取多维表格"""
        # 获取多维表格元信息
        meta = self._make_request(
            f"{self.base_url}/bitable/v1/apps/{app_token}"
        )
        
        # 获取数据表列表
        tables_data = self._make_request(
            f"{self.base_url}/bitable/v1/apps/{app_token}/tables"
        )
        
        tables = tables_data.get("items", [])
        tables_content = []
        
        for table in tables:
            table_id = table.get("table_id")
            table_name = table.get("name", "Table")
            
            try:
                # 获取字段信息
                fields_data = self._make_request(
                    f"{self.base_url}/bitable/v1/apps/{app_token}/tables/{table_id}/fields"
                )
                fields = fields_data.get("items", [])
                
                # 获取记录（带分页）
                records = self._get_all_bitable_records(app_token, table_id)
                
                tables_content.append({
                    "table_id": table_id,
                    "name": table_name,
                    "fields": fields,
                    "records": records,
                    "record_count": len(records)
                })
            except Exception as e:
                logger.warning(f"读取数据表 {table_name} 失败: {e}")
                tables_content.append({
                    "table_id": table_id,
                    "name": table_name,
                    "error": str(e)
                })
        
        return {
            "app": meta.get("app", {}),
            "tables": tables_content,
            "table_count": len(tables)
        }
    
    def _get_all_bitable_records(self, app_token: str, table_id: str) -> List[Dict]:
        """获取多维表格所有记录（处理分页）"""
        all_records = []
        page_token = None
        
        while True:
            params = {"page_size": 500}
            if page_token:
                params["page_token"] = page_token
            
            data = self._make_request(
                f"{self.base_url}/bitable/v1/apps/{app_token}/tables/{table_id}/records",
                params=params
            )
            
            records = data.get("items", [])
            all_records.extend(records)
            
            if not data.get("has_more", False):
                break
            page_token = data.get("page_token")
            
            # 安全限制
            if len(all_records) > 10000:
                logger.warning("记录数超过10000，停止获取更多数据")
                break
        
        return all_records
    
    # ==================== WIKI (知识库) ====================
    
    def _read_wiki(self, token: str, space_id: str = None) -> Dict[str, Any]:
        """
        读取知识库节点
        
        Wiki节点的读取流程:
        1. 通过token获取节点信息 (包含obj_type和obj_token)
        2. 根据obj_type调用对应的文档读取API获取实际内容
        """
        # 获取Wiki节点信息
        node_info = self._get_wiki_node_info(token)
        
        obj_type = node_info.get("obj_type", "")
        obj_token = node_info.get("obj_token", "")
        
        logger.info(f"Wiki节点: obj_type={obj_type}, obj_token={obj_token}")
        
        # 根据obj_type获取实际内容
        content = None
        if obj_type == "docx" or obj_type == "doc":
            try:
                content = self._read_docx(obj_token)
            except Exception as e:
                logger.warning(f"读取Wiki文档内容失败: {e}")
                content = {"error": str(e)}
        elif obj_type == "sheet":
            try:
                content = self._read_sheet(obj_token)
            except Exception as e:
                logger.warning(f"读取Wiki表格内容失败: {e}")
                content = {"error": str(e)}
        elif obj_type == "bitable":
            try:
                content = self._read_bitable(obj_token)
            except Exception as e:
                logger.warning(f"读取Wiki多维表格内容失败: {e}")
                content = {"error": str(e)}
        else:
            content = {"note": f"暂不支持读取类型 {obj_type} 的内容"}
        
        # 获取子节点列表
        children = []
        if node_info.get("has_child", False):
            try:
                children = self._get_wiki_children(node_info.get("space_id"), token)
            except Exception as e:
                logger.warning(f"获取子节点失败: {e}")
        
        return {
            "node": node_info,
            "content": content,
            "children": children,
        }
    
    def _get_wiki_node_info(self, token: str) -> Dict[str, Any]:
        """获取Wiki节点信息"""
        data = self._make_request(
            f"{self.base_url}/wiki/v2/spaces/get_node",
            params={"token": token}
        )
        return data.get("node", {})
    
    def _get_wiki_children(self, space_id: str, parent_token: str) -> List[Dict]:
        """获取Wiki子节点列表"""
        all_children = []
        page_token = None
        
        while True:
            params = {"page_size": 50, "parent_node_token": parent_token}
            if page_token:
                params["page_token"] = page_token
            
            data = self._make_request(
                f"{self.base_url}/wiki/v2/spaces/{space_id}/nodes",
                params=params
            )
            
            items = data.get("items", [])
            all_children.extend(items)
            
            if not data.get("has_more", False):
                break
            page_token = data.get("page_token")
        
        return all_children
    
    def read_wiki_space(self, space_id: str, recursive: bool = False) -> Dict[str, Any]:
        """
        读取整个知识空间
        
        Args:
            space_id: 知识空间ID
            recursive: 是否递归读取所有子节点内容
        """
        # 获取知识空间信息
        space_info = self._make_request(
            f"{self.base_url}/wiki/v2/spaces/{space_id}"
        )
        
        # 获取根节点列表
        nodes = self._get_wiki_space_nodes(space_id)
        
        if recursive:
            # 递归读取所有节点内容
            nodes = self._read_wiki_nodes_recursive(space_id, nodes)
        
        return {
            "space": space_info.get("space", {}),
            "nodes": nodes,
            "node_count": len(nodes)
        }
    
    def _get_wiki_space_nodes(self, space_id: str, parent_token: str = None) -> List[Dict]:
        """获取知识空间节点列表"""
        all_nodes = []
        page_token = None
        
        while True:
            params = {"page_size": 50}
            if parent_token:
                params["parent_node_token"] = parent_token
            if page_token:
                params["page_token"] = page_token
            
            data = self._make_request(
                f"{self.base_url}/wiki/v2/spaces/{space_id}/nodes",
                params=params
            )
            
            items = data.get("items", [])
            all_nodes.extend(items)
            
            if not data.get("has_more", False):
                break
            page_token = data.get("page_token")
        
        return all_nodes
    
    def _read_wiki_nodes_recursive(self, space_id: str, nodes: List[Dict], depth: int = 0) -> List[Dict]:
        """递归读取Wiki节点"""
        if depth > 5:  # 限制递归深度
            return nodes
        
        for node in nodes:
            node_token = node.get("node_token")
            obj_type = node.get("obj_type")
            obj_token = node.get("obj_token")
            
            # 读取节点内容
            try:
                if obj_type == "docx" or obj_type == "doc":
                    node["content"] = self._read_docx(obj_token)
                elif obj_type == "sheet":
                    node["content"] = self._read_sheet(obj_token)
                elif obj_type == "bitable":
                    node["content"] = self._read_bitable(obj_token)
            except Exception as e:
                node["content_error"] = str(e)
            
            # 递归读取子节点
            if node.get("has_child", False):
                try:
                    children = self._get_wiki_space_nodes(space_id, node_token)
                    node["children"] = self._read_wiki_nodes_recursive(space_id, children, depth + 1)
                except Exception as e:
                    node["children_error"] = str(e)
        
        return nodes


def load_config() -> Tuple[str, str]:
    """加载配置"""
    config_paths = [
        "./reference/feishu_config.json",
        os.path.join(os.path.dirname(__file__), "..", "reference", "feishu_config.json"),
    ]
    
    for config_path in config_paths:
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                app_id = config.get("app_id")
                app_secret = config.get("app_secret")
                if app_id and app_secret:
                    return app_id, app_secret
            except Exception as e:
                logger.warning(f"加载配置文件失败: {e}")
    
    # 从环境变量获取
    app_id = os.getenv("FEISHU_APP_ID")
    app_secret = os.getenv("FEISHU_APP_SECRET")
    if app_id and app_secret:
        return app_id, app_secret
    
    raise Exception("未找到有效的配置")


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="飞书统一文档读取器 - 支持docx/doc/sheet/bitable/wiki",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 读取新版文档
  python feishu_reader.py docx_xxxxxxxxxxxxxx
  
  # 读取电子表格
  python feishu_reader.py sheet_xxxxxxxxxxxxxx --type sheet
  
  # 读取多维表格
  python feishu_reader.py basexxxxxxxxxxxxxx --type bitable
  
  # 读取Wiki知识库节点
  python feishu_reader.py wikcnxxxxxxxxxxxxxx --type wiki
  
  # 读取整个知识空间
  python feishu_reader.py --wiki-space SPACE_ID
  
  # 从URL读取
  python feishu_reader.py "https://xxx.feishu.cn/docx/xxxxx"
        """
    )
    
    parser.add_argument("token", nargs="?", help="文档token或URL")
    parser.add_argument("--type", "-t", choices=["docx", "doc", "sheet", "bitable", "wiki", "auto"],
                        default="auto", help="文档类型 (默认自动检测)")
    parser.add_argument("--wiki-space", help="读取整个知识空间 (提供space_id)")
    parser.add_argument("--recursive", "-r", action="store_true",
                        help="递归读取Wiki子节点内容")
    parser.add_argument("--output", "-o", choices=["json", "text"], default="json",
                        help="输出格式")
    parser.add_argument("--pretty", "-p", action="store_true",
                        help="格式化JSON输出")
    
    args = parser.parse_args()
    
    if not args.token and not args.wiki_space:
        parser.print_help()
        sys.exit(1)
    
    try:
        app_id, app_secret = load_config()
        reader = FeishuUnifiedReader(app_id, app_secret)
        
        if args.wiki_space:
            # 读取整个知识空间
            result = reader.read_wiki_space(args.wiki_space, recursive=args.recursive)
        else:
            # 读取单个文档
            doc_type = args.type if args.type != "auto" else None
            result = reader.read(args.token, doc_type=doc_type)
        
        # 输出结果
        if args.output == "text" and "text_content" in result:
            print(result["text_content"])
        else:
            indent = 2 if args.pretty else None
            print(json.dumps(result, ensure_ascii=False, indent=indent))
        
    except KeyboardInterrupt:
        logger.info("操作被用户中断")
        sys.exit(1)
    except Exception as e:
        logger.error(f"错误: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
