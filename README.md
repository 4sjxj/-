# Between · 之间（双人关系 App MVP）

这是一个可部署的手机优先 PWA 起步项目。第一版包含：邮箱注册/登录、邀请码双人绑定、双人空间、每日心情、共同日记、纪念日。聊天入口先作为下一阶段占位。

## 运行前准备

1. 创建 Supabase 项目（https://supabase.com/）。
2. 打开 Supabase 项目的 SQL Editor，执行 `supabase/schema.sql`。
3. 在项目根目录项目已附带 `.env.local`（含你提供的 Project URL 与 Publishable Key）。如需在其他环境部署，请将 `.env.example` 复制为 `.env.local`，填写 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`。
4. 安装 Node.js 20 或更新版本。

```bash
npm install
npm run dev
```

终端会显示本地访问地址。部署时可使用 Vercel 或 Netlify，并把两个 `VITE_SUPABASE_*` 环境变量（URL 与 Publishable Key）配置到部署平台。

## 两部手机如何使用

1. 部署后，两个人打开同一个网址。
2. 各自使用不同邮箱注册并登录。
3. A 创建双人空间，把邀请码发给 B。
4. B 输入邀请码加入。
5. 两个人便可共享心情记录、共同日记和纪念日数据。

## 当前版本边界

- 这是 MVP 开发起点，不是已经上线的托管服务。必须配置自己的 Supabase 项目并部署，才会有跨设备真实数据。
- 聊天、推送通知、图片上传、密码找回、账号删除、解绑后的数据处理、邀请码过期/撤销尚未完成。
- 数据库已启用 RLS，且邀请码绑定由服务端函数完成。上线前仍建议进行安全审查、邮件验证配置和端到端测试。
- 当前每日心情和日记为双人共享内容；不要记录不愿让对方看到的私人信息。


## 已配置的 Supabase 项目

当前 `.env.local` 已填入项目根地址 `https://viwiomedfrdeoxpnkvix.supabase.co` 和你提供的 Publishable Key。该 key 是面向客户端的公开密钥；数据库安全依赖 RLS 策略。不要把 Supabase Secret Key 或旧版 service_role key 放进前端。

**下一步必须执行数据库初始化：** 登录 Supabase Dashboard，打开 SQL Editor，将 `supabase/schema.sql` 全部内容粘贴执行。完成后再运行应用并测试注册、登录、邀请码绑定。此项目尚未自动连接或部署到你的 Supabase 云项目。
