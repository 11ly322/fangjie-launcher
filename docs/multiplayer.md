# 房间联机（0.0.3-beta 实验功能）

方界启动器使用 **EasyTier + SCF** 实现房间码联机：

- 不运营中转、信令或 TURN 服务器；
- 不安装第三方 VPN 软件；
- 不创建 TUN 网卡，不请求管理员权限；
- 不采用 WebRTC，也不手写 NAT 打洞；
- EasyTier 以 Rust 库链接进原生连接器，不启动外部 `easytier-core` 进程。

## 当前集成结构

```text
Electron Renderer (MultiplayerPage)
        │ IPC: multiplayer:host / guest / stop / state
        ▼
Electron Main (src/main/multiplayer.ts)
        │ spawn（不是 easytier-core）
        ▼
qomicex-connector-cli.exe
        ├── EasyTier Rust library（no-tun + smoltcp）
        └── SCF: c:protocols / c:server_port / c:player_ping
```

连接器是独立的 Rust 可执行组件，EasyTier 在连接器进程内以库形式运行；Electron 仅负责
生命周期、房间码展示和把最终地址交给 Minecraft。Tauri 或纯 Rust 启动器可以跳过 IPC，
直接调用同一套 `qomicex_connector` 库。

## Rust 模块结构（参考实现）

对应上游 `crates/qomicex-connector/src`：

```text
room_code
  models/room_code.rs

scaffolding
  center/scaffolding_center.rs     Host 侧 SCF 中心
  guest/scaffolding_guest.rs       Guest 侧发现、协商、心跳
  core/center_discovery.rs         扫描虚拟网节点
  core/protocol_serializer.rs      SCF 帧编解码
  protocols/                       c:ping / c:protocols / c:server_port / c:player_ping

host
  client.rs :: ScaffoldingClient::create_room

guest
  client.rs :: ScaffoldingClient::join_room
  guest/scaffolding_guest.rs :: map_minecraft_port

easytier
  easytier/manager.rs              库内嵌、--no-tun、smoltcp、端口转发 patch

daemon
  qomicex-connector-cli            当前启动器侧进程入口
```

### 房间码

```rust
pub struct RoomCode { /* raw, network_name_part, secret_part */ }

impl RoomCode {
    pub fn generate() -> Self;
    pub fn parse(code: &str) -> Result<Self, RoomCodeError>;
    pub fn raw(&self) -> &str;
    pub fn network_name_part(&self) -> &str;
    pub fn secret_part(&self) -> &str;
    pub fn easy_tier_network_name(&self) -> String;
    pub fn easy_tier_network_secret(&self) -> &str;
}
```

格式为 `U/XXXX-XXXX-XXXX-XXXX`。字符集为 34 个字符：`0-9` 加去掉 `I`、`O` 的
`A-Z`。前两组派生 EasyTier `network-name`，后两组作为 network-secret；8 字符组的
交替加减结果对 7 取模为 0，作为校验约束。

### Host

```rust
pub struct HostConfig {
    pub player_name: String,
    pub mc_port: u16,
    pub relay_nodes: Vec<String>,
}

pub struct HostSession { /* center, cancellation token */ }

impl HostSession {
    pub async fn start(cfg: HostConfig) -> Result<Self, MultiplayerError>;
    pub fn room_code(&self) -> &RoomCode;
    pub async fn players(&self) -> Vec<PlayerInfo>;
    pub async fn stop(self) -> Result<(), MultiplayerError>;
}
```

### Guest

```rust
pub struct GuestConfig {
    pub room_code: RoomCode,
    pub player_name: String,
    pub relay_nodes: Vec<String>,
}

pub struct GuestSession { /* guest client, port forward, heartbeat */ }

impl GuestSession {
    pub async fn join(cfg: GuestConfig) -> Result<Self, MultiplayerError>;
    pub async fn connect_address(&self) -> Result<String, MultiplayerError>;
    pub async fn leave(self);
}
```

### SCF 协商与心跳

```rust
pub trait ScfTransport {
    async fn request(&self, key: &str, body: &[u8]) -> Result<ScfResponse, ScfError>;
}

pub async fn negotiate_protocols(
    transport: &dyn ScfTransport,
    supported: &[String],
) -> Result<Vec<String>, ScfError>;

pub async fn server_port(transport: &dyn ScfTransport) -> Result<u16, ScfError>;

pub async fn player_ping(
    transport: &dyn ScfTransport,
    player: &PlayerInfo,
) -> Result<bool, ScfError>;
```

Guest 每 5 秒发送一次 `c:player_ping`；Host 维护玩家表，15 秒未刷新则移除。

## 公共节点

连接器内置 EasyTier 社区公共中继：

```text
tcp://cgk1.clusters.zeabur.com:22171
tcp://tcp.ap-northeast-1.clawcloudrun.com:45146
```

启动器以重复的 `--relay` 参数传给连接器，不使用任何自建地址。节点不可达时连接器会
尝试下一个；上游也支持在线获取社区节点列表，但本版固定内置，避免首次启动被节点服务
可用性影响。

## 降级路径

Guest 先尝试房主虚拟 IP。若虚拟 IP 不可达，连接器通过 EasyTier
`apply_config_patch` 动态添加 TCP 端口转发，而不重启 EasyTier：

```text
127.0.0.1:<local-mc-port> -> <host-virtual-ip>:<mc-port>
```

EasyTier 的 smoltcp 用户态网络栈没有回环语义，因此端口转发的监听端与目标端需要是
可路由地址；本版沿用连接器的实际格式，并将 `127.0.0.1` 作为交给 Minecraft 的最终
连接地址。同机公共中继测试中，Guest 转发端口已与 Host 本地 TCP 服务完成双向回显；
P2P 打洞仍需要真实跨机器网络才能完成最终数据面验证。

## UI 入口

「房间联机」页面提供两个入口：

1. **创建房间**：输入玩家名与 Minecraft 局域网端口，启动 Host 会话，显示大号房间码。
2. **加入房间**：输入房间码与玩家名，启动 Guest 会话，显示可复制到 Minecraft 多人游戏的
   `host:port` 地址。

页面同时显示玩家数、连接状态、公共中继节点和停止/离开按钮。首次使用不需要安装
Npcap、WinPcap 或任何 VPN 驱动。

## 构建连接器

Windows 依赖较重，连接器在 GitHub Actions 中构建：

```powershell
gh workflow run connector-build.yml --ref main
```

工作流固定上游 commit，应用 `native/qomicex-no-packet.patch`，移除
`faketcp`、`wireguard`、`proxy-packet`、`vpn-portal` 和 Windows `tun` feature，
强制 Host/Guest 使用 no-tun + smoltcp，并避免 `packet.dll` 运行时依赖。

构建产物放到 `resources/bin/qomicex-connector-cli.exe`；该可执行文件被 `.gitignore`
忽略，不进入源码提交，随发布包分发。

## 许可证

连接器来自 GPL-3.0-or-later 的 Qomicex Connector；它是独立分发组件，完整文本在
`resources/bin/LICENSE-qomicex.txt`，源码与补丁说明见 `resources/bin/README-qomicex.txt`。
启动器主体仍使用 MIT。
