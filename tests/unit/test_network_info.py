"""
network-info 局域网探测单元测试。

覆盖：UDP socket 探测 + getaddrinfo 枚举的多候选选优、网段提取、
Clash TUN 虚拟网卡段（198.18/15）过滤、非局域网/失败回退 LAN_SUBNET_OVERRIDE。
不真正发包，全部通过 mock socket / getaddrinfo 与 get_settings 实现。
"""
from unittest import mock

from app.core.config import get_settings
from app.services import network_info as ni


class _FakeSocket:
    """模拟一个 connect 到外部地址后 get sockname 的本机 socket。"""

    def __init__(self, sockname):
        self._sockname = sockname

    def connect(self, addr):  # noqa: D401
        pass

    def getsockname(self):
        return self._sockname

    def close(self):
        pass


def _stub_enumeration(monkeypatch, ips):
    """钉住 getaddrinfo 枚举源，隔离测试机真实网卡，保证结果确定。"""
    monkeypatch.setattr(ni, "_enumerate_local_ips", lambda: list(ips))


# ---------- 单一来源：UDP 探测 ----------


def test_detect_local_ip_private_lan(monkeypatch):
    """UDP connect 返回局域网私网 IP → 命中并返回该 IP。"""
    fake = _FakeSocket(("192.168.1.10", 0))
    _stub_enumeration(monkeypatch, [])
    with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
        assert ni.detect_local_ip() == "192.168.1.10"


def test_detect_local_ip_rejects_loopback_and_link_local(monkeypatch):
    """回环 127.x 与链路本地 169.254.x 不属于可被手机直连的局域网，应过滤。"""
    _stub_enumeration(monkeypatch, [])
    for bad in ("127.0.0.1", "169.254.1.1"):
        fake = _FakeSocket((bad, 0))
        with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
            assert ni.detect_local_ip() is None


def test_detect_local_ip_failure_returns_none(monkeypatch):
    """无网络（connect 抛异常）且枚举无候选 → 返回 None。"""
    _stub_enumeration(monkeypatch, [])

    class FailingSocket:
        def __init__(self, *a, **k):
            pass

        def connect(self, addr):
            raise OSError("network unreachable")

        def close(self):
            pass

    with mock.patch.object(ni, "_new_udp_socket", FailingSocket):
        assert ni.detect_local_ip() is None


def test_subnet_of_takes_first_three_octets():
    assert ni._subnet_of("192.168.1.10") == "192.168.1"
    assert ni._subnet_of("10.0.0.5") == "10.0.0"
    assert ni._subnet_of("172.16.3.9") == "172.16.3"
    # 非 IPv4 / 非法 → 空
    assert ni._subnet_of("") == ""
    assert ni._subnet_of("::1") == ""
    assert ni._subnet_of("not-an-ip") == ""


# ---------- 多候选收集与优先级选优 ----------


def test_detect_local_ip_tun_udp_but_lan_from_enumeration(monkeypatch):
    """回归 Clash TUN bug：UDP 路由探测拿到 TUN 段 198.18.0.1，
    getaddrinfo 给出真实局域网 192.168.1.10 → 必须选后者。"""
    fake = _FakeSocket(("198.18.0.1", 0))
    _stub_enumeration(monkeypatch, ["192.168.1.10"])
    with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
        assert ni.detect_local_ip() == "192.168.1.10"


def test_detect_local_ip_prefers_192168_over_10(monkeypatch):
    """候选含 192.168.x 与 10.x → 选 192.168.x（家庭 WiFi 最常见段）。"""
    fake = _FakeSocket(("10.0.0.5", 0))
    _stub_enumeration(monkeypatch, ["192.168.31.24", "10.0.0.5"])
    with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
        assert ni.detect_local_ip() == "192.168.31.24"


def test_detect_local_ip_prefers_10_over_172_16(monkeypatch):
    """候选含 172.20.x（Docker 常见）与 10.x → 选 10.x（172.16/12 排最后）。"""
    fake = _FakeSocket(("172.20.0.3", 0))
    _stub_enumeration(monkeypatch, ["10.0.0.5", "172.20.0.3"])
    with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
        assert ni.detect_local_ip() == "10.0.0.5"


def test_detect_local_ip_udp_wins_within_same_tier(monkeypatch):
    """同级（同为 10/8）时 UDP 路由探测结果优先于 getaddrinfo 枚举结果。"""
    fake = _FakeSocket(("10.0.0.5", 0))
    _stub_enumeration(monkeypatch, ["10.0.0.99", "10.0.0.5"])
    with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
        assert ni.detect_local_ip() == "10.0.0.5"


def test_detect_local_ip_all_virtual_returns_none(monkeypatch):
    """全部候选都是 TUN/虚拟段（198.18/15）→ 过滤后无候选，返回 None。"""
    fake = _FakeSocket(("198.18.0.1", 0))
    _stub_enumeration(monkeypatch, ["198.18.0.1", "198.19.0.2"])
    with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
        assert ni.detect_local_ip() is None


def test_detect_local_ip_getaddrinfo_failure_degrades_to_udp(monkeypatch):
    """getaddrinfo 抛 OSError → 尽力而为降级，仍可用 UDP 探测结果。"""
    fake = _FakeSocket(("192.168.1.10", 0))

    def _boom(*a, **k):
        raise OSError("getaddrinfo failed")

    monkeypatch.setattr(ni.socket, "getaddrinfo", _boom)
    with mock.patch.object(ni, "_new_udp_socket", return_value=fake):
        assert ni.detect_local_ip() == "192.168.1.10"


def test_detect_local_ip_udp_failure_uses_enumeration(monkeypatch):
    """UDP 探测失败（无路由）但 getaddrinfo 枚举到局域网 IP → 用枚举结果。"""

    class FailingSocket:
        def __init__(self, *a, **k):
            pass

        def connect(self, addr):
            raise OSError("no route")

        def close(self):
            pass

    _stub_enumeration(monkeypatch, ["192.168.1.10"])
    with mock.patch.object(ni, "_new_udp_socket", FailingSocket):
        assert ni.detect_local_ip() == "192.168.1.10"


# ---------- get_network_info：契约与回退 ----------


def test_get_network_info_success(monkeypatch):
    """探测成功 → {subnet, host_ip}。"""
    fake = _FakeSocket(("192.168.1.10", 0))
    _stub_enumeration(monkeypatch, [])
    monkeypatch.setattr(ni, "_new_udp_socket", lambda *a, **k: fake)
    info = ni.get_network_info()
    assert info == {"subnet": "192.168.1", "host_ip": "192.168.1.10"}


def test_get_network_info_fallback_to_override(monkeypatch):
    """探测失败 → 回退 LAN_SUBNET_OVERRIDE。"""
    _stub_enumeration(monkeypatch, [])

    class FailingSocket:
        def __init__(self, *a, **k):
            pass

        def connect(self, addr):
            raise OSError("no route")

        def close(self):
            pass

    monkeypatch.setattr(ni, "_new_udp_socket", FailingSocket)
    monkeypatch.setattr(
        get_settings(),
        "LAN_SUBNET_OVERRIDE",
        "192.168.5",
    )
    info = ni.get_network_info()
    assert info == {"subnet": "192.168.5", "host_ip": ""}


def test_get_network_info_nonlan_fallback_to_override(monkeypatch):
    """探测到非局域网（如虚拟网卡/NAT 出口的公网 IP）→ 回退 override。"""
    _stub_enumeration(monkeypatch, [])
    fake = _FakeSocket(("8.8.8.8", 0))  # 公网 DNS，非 RFC1918
    monkeypatch.setattr(ni, "_new_udp_socket", lambda *a, **k: fake)
    monkeypatch.setattr(
        get_settings(),
        "LAN_SUBNET_OVERRIDE",
        "10.10.10",
    )
    info = ni.get_network_info()
    assert info == {"subnet": "10.10.10", "host_ip": ""}


def test_get_network_info_all_virtual_fallback_to_override(monkeypatch):
    """回归：全候选均为 Clash TUN 段 → 返回 None → 回退 LAN_SUBNET_OVERRIDE。"""
    fake = _FakeSocket(("198.18.0.1", 0))
    _stub_enumeration(monkeypatch, ["198.18.0.1"])
    monkeypatch.setattr(ni, "_new_udp_socket", lambda *a, **k: fake)
    monkeypatch.setattr(get_settings(), "LAN_SUBNET_OVERRIDE", "192.168.5")
    assert ni.get_network_info() == {"subnet": "192.168.5", "host_ip": ""}


def test_get_network_info_no_override_all_empty(monkeypatch):
    """探测失败且无 override → 全空。"""
    _stub_enumeration(monkeypatch, [])

    class FailingSocket:
        def __init__(self, *a, **k):
            pass

        def connect(self, addr):
            raise OSError("no route")

        def close(self):
            pass

    monkeypatch.setattr(ni, "_new_udp_socket", FailingSocket)
    monkeypatch.setattr(get_settings(), "LAN_SUBNET_OVERRIDE", "")
    assert ni.get_network_info() == {"subnet": "", "host_ip": ""}
