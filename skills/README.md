# skills/

这里放的是**给 Claude 看的作业指导书**，不是项目代码——删掉它 App 照样跑。

## 这是什么

一个 "skill"（技能）就是一个文件夹，里面用大白话写清楚"在这个项目里该怎么干活"。
Claude 每次开新对话都是失忆的，不会记得上次为什么那样改。把方法写在这里，
它下次就能直接照着做，不用你重新讲一遍"记得跑测试""记得改版本号"。

## 现在有什么

```
todolist-dev/
├── SKILL.md                    主文件：加功能的七步流程、三条硬约束、怎么和你沟通
└── references/
    ├── architecture.md         代码怎么组织、依赖注入、状态重置、样式变量
    ├── testing.md              测试怎么写、变异测试怎么做、三种坏测试
    └── pitfalls.md             踩过的坑：缓存、时区、手机端、标识符
```

`SKILL.md` 是入口，另外三个是它按需去翻的资料。这样分是因为
一次全塞给 Claude 会挤占它思考的空间，写代码时才去翻 `architecture.md` 更划算。

## 怎么让它真正生效

Claude Code 只会自动加载 `.claude/skills/` 里的技能。这个文件夹在项目根目录，
所以还差一步——建一个快捷方式指过去（只用做一次）：

```bash
mkdir -p .claude/skills && ln -s ../../skills/todolist-dev .claude/skills/todolist-dev
```

做完之后，新开对话时 Claude 会自己发现它。
不想做也行，直接跟它说"看一下 skills/todolist-dev/SKILL.md"效果一样，只是每次都要说。

## 以后怎么改

**每次踩了新坑、或者定下新约定，就顺手加一句。** 这个文件夹的价值全在于它是活的。

判断该写进哪里：

| 内容 | 写进 |
|---|---|
| 流程变了（比如以后加了新的收尾步骤） | `SKILL.md` |
| 代码写法上的新约定 | `references/architecture.md` |
| 测试方法上的新发现 | `references/testing.md` |
| 又栽了一次的坑 | `references/pitfalls.md` |
| "已经做了什么"的记录 | 不写这儿，写 `tools/README.md` 或根目录 `README.md` |

最后一行最容易搞混：`skills/` 记的是**该怎么做**，两个 `README.md` 记的是**已经做了什么**。
