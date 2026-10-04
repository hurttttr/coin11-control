"""
局域网信息探测 — 为 GET /api/devices/network-info 提供 IP/网段。

探测策略（多候选收集 + 优先级选优）：

1. 候选来源（合并去重，UDP 路由探测结果排在最前）：
   - UDP socket connect 到外部地址（8.8.8.8:80，仅触发路由选择，不真正发包），
     getsockname() 返回系统默认路由对应的出网网卡 IP；
   - getaddrinfo(gethostname()) 枚举本机全部 IPv4（尽力而为，失败不致命）。
2. 过滤（逐个候选）：必须是合法 IPv4 且属于 RFC1918 私网；
   排除回环 127/8、链路本地 169.254/16、以及 198.18.0.0/15。
   —— 198.18/15 是 Clash/Mihomo TUN 虚拟网卡的默认地址段（benchmark 保留段）：
      用户开 Clash TUN 后系统默认路由走 TUN，UDP 探测会拿到 198.18.0.1；
      Python ipaddress 的 is_private 恰好把该段当私网，直接放行就会把
      "subnet" 污染成 "198.18"，这是历史 bug 根因，必须显式排除。
3. 排序选优：192.168/16 > 10/8 > 172.16/12。
   家庭/手机所在 WiFi 局域网几乎总在 192.168/16；10/8 次之（企业网）；
   172.16/12 最后 —— Docker/WSL/Hyper-V 虚拟交换机惯用该段，常为"假局域网"。
   同级内 UDP 路由探测结果优先（排序稳定，候选收集时它排在最前）。
4. LAN_SUBNET_OVERRIDE 配置了值 → 跳过探测直接采用（Docker 容器内只能看到
   虚拟网桥段，探测必然"成功"，覆盖值必须最优先）。
5. 无任何候选 → get_network_info 返回空（host_ip 置空，交由前端拼 IP 建议）。

subnet 取 IP 前三段（如 192.168.1.10 → "192.168.1"）。
"""
from __future__ import annotations

import ipaddress
import logging
import socket

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# UDP connect 的目标（仅触发路由选择，不发送任何数据）
_UDP_PROBE_HOST = "8.8.8.8"
_UDP_PROBE_PORT = 80

# RFC1918 私网段：手机/电脑所在的真实局域网只可能在这里。
# 注意不要用 ipaddress 的 is_private 判定 —— 它把 198.18/15（benchmark
# 保留段）、TEST-NET 等也算 private，会放过 Clash TUN 的 198.18.0.1。
_RFC1918_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)

# 显式排除段（均不属于 RFC1918，这里显式写出以防上游放宽判定时漏拦）：
# - 127.0.0.0/8      回环
# - 169.254.0.0/16   链路本地（DHCP 失败自分配）
# - 198.18.0.0/15    Clash/Mihomo TUN 虚拟网卡特征段
_EXCLUDED_NETWORKS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
)

# 真实局域网优先级（下标越小越优先）
_LAN_PRIORITY = (
    ipaddress.ip_network("192.168.0.0/16"),  # 家庭/手机 WiFi 最常见
    ipaddress.ip_network("10.0.0.0/8"),      # 企业网常见
    ipaddress.ip_network("172.16.0.0/12"),   # Docker/WSL/Hyper-V 惯用，最后
)


def _new_udp_socket() -> socket.socket:
    """创建探测用 UDP socket（独立工厂，便于测试 mock 而不污染全局 socket.socket）。"""
    return socket.socket(socket.AF_INET, socket.SOCK_DGRAM)


def _probe_udp_ip() -> str | None:
    """UDP connect 触发系统路由选择，返回默认路由对应的本机网卡 IP（尽力而为）。

    注意：Clash TUN 开启时这里拿到的是 TUN 地址（198.18.0.1），
    由 _is_private_lan 过滤、不作为唯一依据。
    """
    s = _new_udp_socket()
    try:
        s.connect((_UDP_PROBE_HOST, _UDP_PROBE_PORT))
        ip: str = s.getsockname()[0]
        return ip
    except OSError as e:  # 无网络 / 无默认路由
        logger.debug("UDP 路由探测本机 IP 失败: %s", e)
        return None
    finally:
        s.close()


def _enumerate_local_ips() -> list[str]:
    """getaddrinfo 枚举本机全部 IPv4 地址（尽力而为，失败返回空列表）。"""
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except OSError as e:  # 含 gaierror：主机名解析失败等
        logger.debug("getaddrinfo 枚举本机 IP 失败: %s", e)
        return []
    ips: list[str] = []
    for info in infos:
        addr = info[4][0]
        if isinstance(addr, str):  # AF_INET 下恒为 str，isinstance 仅作类型收窄
            ips.append(addr)
    return ips


def _is_private_lan(ip: str) -> bool:
    """判断 IP 是否属于可被手机直连的局域网私网段（RFC1918）。

    排除回环 127/8、链路本地 169.254/16、Clash TUN 特征段 198.18/15。
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.version != 4:
        return False
    if any(addr in net for net in _EXCLUDED_NETWORKS):
        return False
    return any(addr in net for net in _RFC1918_NETWORKS)


def _lan_rank(ip: str) -> int:
    """网段优先级（越小越优先）：192.168/16 → 10/8 → 172.16/12。

    仅供已通过 _is_private_lan 的候选使用；非 RFC1918 返回兜底大值。
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return len(_LAN_PRIORITY)
    for rank, net in enumerate(_LAN_PRIORITY):
        if addr in net:
            return rank
    return len(_LAN_PRIORITY)


def detect_local_ip() -> str | None:
    """多候选收集（UDP 路由探测 + getaddrinfo 枚举）并按局域网优先级选优。

    返回选中的局域网 IPv4；无任何可用候选时返回 None（交由上层回退 override）。
    """
    # 候选收集：UDP 路由探测结果放最前 —— 同级排序时（稳定排序）它优先
    candidates: list[str] = []
    udp_ip = _probe_udp_ip()
    if udp_ip:
        candidates.append(udp_ip)
    for ip in _enumerate_local_ips():
        if ip not in candidates:  # 去重，且保留 UDP 结果的靠前位置
            candidates.append(ip)

    ranked = [(ip, _lan_rank(ip)) for ip in candidates if _is_private_lan(ip)]
    if not ranked:
        logger.debug("未探测到可用局域网 IP，候选=%r", candidates)
        return None
    ranked.sort(key=lambda pair: pair[1])  # 稳定排序：同级保持收集顺序
    chosen = ranked[0][0]
    if len(ranked) > 1 and logger.isEnabledFor(logging.DEBUG):
        logger.debug("候选 IP 排序结果=%r，选中 %s", ranked, chosen)
    return chosen


def _subnet_of(ip: str) -> str:
    """取 IPv4 前三段作为网段标识；非合法 IPv4 返回空串。"""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ""
    if addr.version != 4:
        return ""
    return ".".join(str(ip).split(".")[:3])


def get_network_info() -> dict:
    """返回 {"subnet": str, "host_ip": str}。

    LAN_SUBNET_OVERRIDE 显式配置时直接采用（host_ip 置空，由前端自行建议）——
    Docker 部署下容器只能探测到虚拟网桥网段（RFC1918 合法），探测必然"成功"，
    无法得知宿主机真实局域网，因此显式配置必须优先于自动探测；
    未配置时走自动探测，探测失败返回空。
    """
    override = (get_settings().LAN_SUBNET_OVERRIDE or "").strip()
    if override:
        return {"subnet": override, "host_ip": ""}

    ip = detect_local_ip()
    if ip:
        subnet = _subnet_of(ip)
        if subnet:
            return {"subnet": subnet, "host_ip": ip}

    return {"subnet": "", "host_ip": ""}
