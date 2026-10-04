import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置，从 .env 文件加载"""

    # coin11-tb 内置路径（空字符串表示使用默认内置路径）
    COIN11_TB_PATH: str = ""
    # coin11-tb 远程仓库地址
    COIN11_TB_REPO_URL: str = "https://github.com/czl0325/coin11-tb.git"

    # ADB 可执行文件路径
    ADB_PATH: str = "adb"

    # 服务监听地址
    HOST: str = "127.0.0.1"

    # 服务监听端口
    PORT: int = 8000

    # 局域网网段覆盖值（可选，前三段，如 "192.168.31"）。设置后优先于自动探测。
    # Docker 部署必配：容器内只能探测到虚拟网桥网段，无法得知宿主机真实局域网。
    # 手机扫码配对需后端 0.0.0.0 监听且手机与宿主机同网。
    LAN_SUBNET_OVERRIDE: str = ""

    # CORS 允许的来源（JSON 数组字符串；pydantic-settings 对 list[str] 自动做 JSON 解析）
    CORS_ORIGINS: list[str] = [
        "http://localhost:6173",
        "http://127.0.0.1:6173",
    ]

    # WebSocket 鉴权 Token（本地单用户场景用简单 token）
    # 前端在构建期经 VITE_WS_TOKEN 注入（Dockerfile 用同名 ARG 同时注入两侧保证配对）；
    # 修改此值必须同步重建前端（Docker：--build-arg WS_AUTH_TOKEN=<新值> 重建镜像），
    # 否则 WS 因 token 失配全部 403。
    WS_AUTH_TOKEN: str = "coin11-control-token"

    # API 鉴权 Token（可选，默认关闭以保持向后兼容）
    # 设置后：所有 /api/* 请求必须携带 Authorization: Bearer <token> 或 X-API-Token 头，
    # /api/health 始终豁免（供健康检查使用）。监听非回环地址时强烈建议设置。
    API_AUTH_TOKEN: str | None = None

    # 日志级别（DEBUG / INFO / WARNING / ERROR）
    LOG_LEVEL: str = "INFO"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def coin11_tb_path_resolved(self) -> str:
        """获取 coin11-tb 绝对路径

        如果 COIN11_TB_PATH 非空，直接使用该值；
        否则使用后端项目根目录下的 coin11_tb/ 内置路径
        """
        if self.COIN11_TB_PATH:
            return self.COIN11_TB_PATH
        # 默认：后端项目根目录下的 coin11_tb/
        backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(backend_root, "coin11_tb")


@lru_cache
def get_settings() -> Settings:
    """获取全局单例配置"""
    return Settings()
