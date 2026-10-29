# 跨机器联机验证矩阵

目标不是证明 EasyTier 公共节点永远可用，而是持续记录失败边界，避免把同机回环或单一 NAT 环境当成普遍可用。

## 每次发布前

- [ ] 两台不同公网 IP 的 Windows 机器，家庭 NAT，IPv4。
- [ ] 同一局域网两台机器（应走局域网/直连或明确显示中继）。
- [ ] 对称 NAT / 双重 NAT / CGNAT 至少一种。
- [ ] Windows Defender 防火墙“公用网络”严格模式。
- [ ] 一方 IPv6-only 或双栈。
- [ ] 公司代理 / UDP 受限 / 仅 TCP。
- [ ] 房主休眠、切换 Wi-Fi、重新开房。
- [ ] 第一个公共 relay 不可达时，连接器尝试下一个节点。
- [ ] 房客退出后房主玩家数下降。
- [ ] 房间码复制/粘贴自动解析。
- [ ] 网络摘要导出不包含令牌、UUID、世界路径。

## 记录字段

```json
{
  "role": "host|guest",
  "phase": "starting|ready|error",
  "roomCodeMasked": "U/****-****-****-****",
  "path": "direct|relay|unknown",
  "relay": "host:port",
  "latencyMs": 0,
  "players": 2,
  "os": "Windows 11 24H2",
  "connectorVersion": "…",
  "error": "…",
  "timestamp": "ISO-8601"
}
```

## 失败边界

- 对称 NAT 下无法直连时，是否仍能通过公共中继建立 TCP？
- 防火墙阻断 UDP 时，连接器是否仍尝试 TCP relay？
- relay 全部不可达时，错误是否能在 120 秒内给出可操作提示？
- 房间码是否严格区分易混淆字符（I/O/0/1）？
- 断开后是否清理虚拟网络与端口转发？
- 玩家数是否只来自 SCF 可信消息，而不是本地猜测？
- 延迟是 P2P 还是 relay TCP？UI 必须明确标注，不能混用。

## 当前状态

- 已验证同机 Host/Guest、SCF 玩家列表、TCP 双向回显。
- 公共中继可用性依赖社区节点。
- 真实跨机器 NAT、对称 NAT、严格防火墙尚未形成自动回归。
- 当前启动器只测量公共中继 TCP 延迟；P2P 直连/延迟需要连接器上报真实指标。
