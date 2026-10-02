from enum import StrEnum


class DeviceStatus(StrEnum):
    """设备连接状态"""
    ONLINE = "online"
    OFFLINE = "offline"
    BUSY = "busy"


class TaskStatus(StrEnum):
    """任务执行状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ConnectionType(StrEnum):
    """设备连接方式"""
    USB = "usb"
    WIFI = "wifi"
