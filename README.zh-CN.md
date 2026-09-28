# ER Map for Goblins Web

[English](README.md)

一个只读的《艾尔登法环》存档查看器，提供互动地图、角色装备、物品与怪物数据库。项目受到 [Map for Goblins](https://github.com/VirusAlex/ERR-MapForGoblins-DLL) 的启发，在游戏外运行，无需注入 Mod，不读取游戏进程内存，也不修改存档。

项目仍处于早期开发阶段。当前界面以简体中文为主，可用的游戏文本与地图分类支持多种语言。解析器支持采用已知 PC BND4 布局的 `.sl2`、`.co2` 及兼容 `.err` 存档；已有 Vanilla 和 Elden Ring Reforged 数据集支持，但扩展名不能单独证明某个 Mod 或新版游戏兼容。

## 功能与边界

- 交界地、地下和幽影之地地图，支持标记搜索、分类筛选和收集状态。
- 根据存档事件旗标区分已收集、可获取、未解锁与未知状态。
- 查看最后保存的角色位置、死亡卢恩、装备、背包和木箱。
- 查询物品详情，比较不同周目的怪物数据。
- 支持浏览器单次文件选择、可用时的只读持久文件句柄，以及游戏主机上的可选 Save Bridge。

存档在浏览器 Web Worker 中解析，不上传到应用服务器。Save Bridge 将只读快照直接交给获授权的浏览器，不提供写入接口。所有进度反映的是**最后一次落盘的存档**。

GEOM/GEOF 收集状态、部分装备/附加效果解释、NPC 任务图和手机布局尚未完善；局部探索雾的视觉实现暂时搁置。没有充分证据的状态保持未知，不根据“背包里没有”猜测“从未获得”。

## 运行环境

| 部分 | 所需工具 |
| --- | --- |
| 网页 | Node.js 24 或兼容的较新版本；`package.json` 固定的 pnpm **11.19.0** |
| 服务端与 Save Bridge | JDK **25**、Maven **3.9+** |
| 数据工具及测试 | Python **3.12+**；生成图像还需要 Pillow |
| 可选地图构建 | Rust/Cargo、WitchyBND 3.x、本机解包资源；导出游戏字体还需 JPEXS FFDec |
| 可选容器 | Docker Engine 与 Docker Compose v2 |

可以用 [mise](https://mise.jdx.dev/) 管理工具，并在下列命令前添加 `mise exec --`；也可以自行把工具加入 PATH。Windows 上组合测试还要求包脚本子进程能找到 Python，后文提供分项命令。

本地已用 Java 25、Maven 3.9.11、Node 26.3.0、Python 3.14.6 检查；容器配置使用 Node 24。这不代表全部浏览器与操作系统都已验证。

## 启动网页

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 [http://localhost:5173](http://localhost:5173)。默认是地图；`?page=items` 和 `?page=monsters` 分别打开物品与怪物页面。存档连接和角色面板位于侧边控制栏。

**仓库不包含游戏数据包。** 新克隆的源码可以构建并启动开发服务器，但依赖数据的页面会提示资源缺失，直到你提供本地生成的资源包。程序不会自动下载游戏资源。

如需可选应用服务器，在另一个终端执行：

```sh
mvn -f apps/server/pom.xml spring-boot:run
```

服务器监听 8080 端口，提供 `/api/v1/system/info` 和 `/actuator/health`；Vite 在开发时代理 `/api` 与 `/actuator`。当前没有账户数据库或存档上传服务。

## 准备本地游戏数据

使用合法取得的游戏安装及对应 Mod 资源。Regulation、地图、事件脚本、文本和纹理必须来自匹配的版本。生成资源放入 `runtime/assets/`，中间文件放入 `runtime/work/`，两者均被 Git 忽略。

入口通常为 `runtime/assets/dataset-index.v1.json`，各 Profile 清单位于 `datasets/<profile>/`。网页依照清单加载内容哈希命名的资源。此前完成审计的数据基线是 App/Calibrations **1.17/1.17**；更新版本的输入仍需核验。怪物数值所用社区表格和官方文本可能版本不同，清单会分别记录。

| 说明 | 输出 |
| --- | --- |
| [游戏源清单](tools/game-data/README.md) | 游戏/工具指纹和版本差异 |
| [标记数据集](tools/data-builder/README.md) | 参考流水线生成的 Profile 标记与分类 |
| [地图与文本](tools/map-assets/README.md) | 瓦片、碎片揭示层和文本导出 |
| [地图图标](tools/icon-assets/README.md) | 官方/MFG 图标和地图设施 |
| [物品](tools/item-data/README.md) | 参数、本地化文本与图像 |
| [怪物](tools/monster-data/README.md) | 显式指定参考工作簿的怪物数据 |

这些是开发期离线工具，不是自动解包整款游戏的一键安装程序。第三方工具及上游生成输入需自行准备；具体 Nuxe/WitchyBND 发行版可能需要 Windows。源码开源不表示游戏解包资源可以随意分发。

Vite 从站点根路径提供 `runtime/assets/`，生产构建也会复制其中的本地资源。独立资源主机使用构建时的 `VITE_MFG_ASSET_BASE_URL`。Java 服务可用 `MFG_ASSETS_DIRECTORY` 提供只读目录，通过 `MFG_ASSET_BASE_URL` 声明访问地址。部署配置见 [`.env.example`](.env.example)；离线工具读取显式参数或已导出的环境变量，不会自动加载 `.env`。

## 可选 Save Bridge

Bridge 运行在存放存档的主机上，只提供一个指定文件，支持短期有效、只能成功使用一次的配对链接，默认仅监听回环地址。

```sh
mvn -f pom.xml -pl apps/save-bridge -am package
java -jar apps/save-bridge/target/save-bridge-0.1.0-SNAPSHOT.jar --save "/path/to/ER0000.sl2" --web-url "http://localhost:5173"
```

供另一台设备访问时，可先构建网页，再让 Bridge 同源提供页面：

```sh
pnpm build
java -jar apps/save-bridge/target/save-bridge-0.1.0-SNAPSHOT.jar --save "/path/to/ER0000.sl2" --lan --advertise-host "GAME-PC-LAN-IP" --web-root "apps/web/dist"
```

打开 Bridge 打印的连接链接。`--lan` 显式启用局域网监听，应在可信网络中使用。远程 HTTP 页面可能无法使用浏览器本地文件选择能力，但 Bridge 模式不依赖该能力。更多参数见 [Bridge 说明](apps/save-bridge/README.md)。

## 构建与测试

```sh
pnpm typecheck
pnpm --filter @mfg/web test
python tools/monster-data/build_monster_data_test.py
python tools/item-data/build_item_data_test.py
node --test tools/data-builder/*.test.mjs tools/game-data/*.test.mjs tools/save-analysis/*.test.mjs
mvn -f pom.xml test
pnpm build
```

当包脚本 PATH 能找到 Python 时，`pnpm test` 可组合执行 Python、Web 和 Node 测试。本地资源/存档用例会在输入不存在时跳过，仓库不分发真实存档夹具。源码测试通过不代表新版游戏或游戏内行为已经验证。

网页产物在 `apps/web/dist/`；Maven 模块可分别打包。单独执行 Maven 得到的普通 server JAR **不包含网页构建**，Docker 构建会将两者组合。上述 Bridge `--web-root` 模式也是本地组合运行的一种方式。

## 容器

```sh
docker compose config
docker compose up --build app
```

打开 [http://localhost:8080](http://localhost:8080)。Compose 只读挂载 `runtime/assets/`。独立资源服务和 Bridge 使用可选 profile：

```sh
docker compose --profile assets up --build
docker compose --profile bridge up --build save-bridge
```

启动 Bridge profile 前设置存档目录、容器内文件路径和对外主机地址。构建镜像不会生成游戏数据；目前没有提供已签名原生安装包。

## 源码结构

`apps/web` 是 React/TypeScript 网页，`apps/server` 是 Spring Boot 主机，`apps/save-bridge` 是独立 Java 只读桥接器；`packages` 保存协议定义与解析边界说明，`tools` 保存离线流水线。公开构建不依赖私有仓库。

## 许可与致谢

本项目原创代码采用 **GNU GPL 第 3 版，仅此版本**，标识为 [GPL-3.0-only](https://spdx.org/licenses/GPL-3.0-only.html)。完整文本见 [LICENSE](LICENSE)，范围与第三方声明见 [NOTICE](NOTICE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。该许可不改变第三方代码及游戏内容各自的权利范围。

感谢 **VirusAlex** 的 Map for Goblins 与存档格式研究指导、**Gacsam** 的 Goblin-ERR，以及存档解析器、MapLibre 和声明中研究工具的作者。本项目是独立同人项目，并非 FromSoftware 或 Bandai Namco 的官方产品。
