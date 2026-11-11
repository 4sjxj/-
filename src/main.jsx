import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Heart, CalendarDays, BookHeart, MessageCircle, Sparkles, Link2, LogOut, Plus, Send, LockKeyhole, Users, Smile, HeartHandshake } from 'lucide-react';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && publishableKey ? createClient(url, publishableKey) : null;

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [couple, setCouple] = useState(null);
  const [tab, setTab] = useState('home');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authMode, setAuthMode] = useState('signup');
  const [invite, setInvite] = useState('');
  const [todayMood, setTodayMood] = useState('😊');
  const [todayText, setTodayText] = useState('');
  const [checkins, setCheckins] = useState([]);
  const [entries, setEntries] = useState([]);
  const [entryText, setEntryText] = useState('');
  const [anniversary, setAnniversary] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadUserData(); else { setProfile(null); setCouple(null); } }, [session]);

  useEffect(() => {
    if (!supabase || !couple?.id) return;
    const channel = supabase.channel(`couple-${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_checkins', filter: `couple_id=eq.${couple.id}` }, () => loadUserData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `couple_id=eq.${couple.id}` }, () => loadUserData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [couple?.id]);

  async function loadUserData() {
    if (!supabase || !session) return;
    setLoading(true);
    const uid = session.user.id;
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile(p);
    const { data: membership } = await supabase.from('couple_members').select('couple_id, couples(*)').eq('user_id', uid).maybeSingle();
    const c = membership?.couples || null;
    setCouple(c);
    if (c) {
      const [{ data: cs }, { data: es }] = await Promise.all([
        supabase.from('daily_checkins').select('*, profiles(display_name)').eq('couple_id', c.id).order('created_at', { ascending: false }).limit(14),
        supabase.from('journal_entries').select('*, profiles(display_name)').eq('couple_id', c.id).order('created_at', { ascending: false }).limit(20)
      ]);
      setCheckins(cs || []); setEntries(es || []); setAnniversary(c.anniversary_date || '');
    }
    setLoading(false);
  }

  async function authenticate(e) {
    e.preventDefault(); if (!supabase) return;
    setLoading(true); setNotice('');
    let result;
    if (authMode === 'signup') {
      result = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    } else result = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) setNotice(result.error.message);
    else if (authMode === 'signup' && !result.data.session) setNotice('注册成功！请先到邮箱确认，再回来登录。');
  }

  async function createPair() {
    if (!supabase || !session) return;
    setLoading(true); setNotice('');
    const { data: codeData, error: codeError } = await supabase.rpc('create_couple_invite');
    setLoading(false);
    if (codeError) setNotice(codeError.message); else { setInvite(codeData); setNotice('邀请码已生成，分享给另一位用户即可绑定。'); await loadUserData(); }
  }

  async function joinPair(e) {
    e.preventDefault(); if (!supabase) return;
    setLoading(true); setNotice('');
    const { error } = await supabase.rpc('join_couple_with_invite', { invite_code: invite.trim().toUpperCase() });
    setLoading(false);
    if (error) setNotice(error.message); else { setNotice('绑定成功，欢迎来到你们的专属空间。'); await loadUserData(); }
  }

  async function submitCheckin(e) {
    e.preventDefault(); if (!supabase || !couple) return;
    setLoading(true);
    const { error } = await supabase.from('daily_checkins').upsert({ couple_id: couple.id, user_id: session.user.id, mood: todayMood, note: todayText, checkin_date: new Date().toISOString().slice(0,10) }, { onConflict: 'couple_id,user_id,checkin_date' });
    setLoading(false); setNotice(error ? error.message : '今天的心情已记录。'); if (!error) { setTodayText(''); await loadUserData(); }
  }

  async function addEntry(e) {
    e.preventDefault(); if (!supabase || !couple || !entryText.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('journal_entries').insert({ couple_id: couple.id, user_id: session.user.id, content: entryText.trim() });
    setLoading(false); setNotice(error ? error.message : '已写进你们的时光里。'); if (!error) { setEntryText(''); await loadUserData(); }
  }

  async function saveAnniversary(e) {
    e.preventDefault(); if (!supabase || !couple) return;
    const { error } = await supabase.from('couples').update({ anniversary_date: anniversary || null }).eq('id', couple.id);
    setNotice(error ? error.message : '纪念日已保存。'); await loadUserData();
  }

  async function signOut() { await supabase?.auth.signOut(); }
  const daysTogether = useMemo(() => {
    if (!anniversary) return null;
    const start = new Date(anniversary + 'T00:00:00');
    return Math.max(0, Math.floor((new Date(new Date().toDateString()) - start) / 86400000) + 1);
  }, [anniversary]);

  if (!supabase) return <Setup />;
  if (!session) return <main className="auth-shell"><div className="brand-mark"><Heart fill="currentColor"/><span>BETWEEN</span></div><section className="auth-card"><p className="eyebrow">TWO PEOPLE, ONE LITTLE WORLD</p><h1>{authMode === 'signup' ? '从认识彼此开始' : '欢迎回来'}</h1><p className="muted">为两个人，留一块只属于彼此的地方。</p><form onSubmit={authenticate} className="stack">{authMode === 'signup' && <label>怎么称呼你？<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="昵称" required /></label>}<label>邮箱<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required /></label><label>密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="6" placeholder="至少 6 位" required /></label><button className="primary" disabled={loading}>{loading?'请稍等…':authMode==='signup'?'创建账号':'登录'}</button></form><button className="text-button" onClick={()=>setAuthMode(authMode==='signup'?'login':'signup')}>{authMode==='signup'?'已经有账号？去登录':'还没有账号？创建一个'}</button>{notice&&<p className="notice">{notice}</p>}</section><p className="footnote"><LockKeyhole size={13}/> 你的账号独立存在，绑定关系需要双方主动操作。</p></main>;

  if (!couple) return <main className="auth-shell"><div className="brand-mark"><Heart fill="currentColor"/><span>BETWEEN</span></div><section className="auth-card"><p className="eyebrow">YOUR SHARED SPACE</p><h1>先连接彼此</h1><p className="muted">你好，{profile?.display_name || session.user.email}。创建一个空间，或输入对方的邀请码加入。</p><button className="primary" onClick={createPair} disabled={loading}><Plus size={18}/> 创建双人空间</button><div className="or"><span>或者</span></div><form onSubmit={joinPair} className="stack"><label>输入对方的邀请码<input value={invite} onChange={e=>setInvite(e.target.value)} placeholder="例如 ABC123" maxLength={12} required /></label><button className="secondary" disabled={loading}>加入双人空间</button></form>{notice&&<p className="notice">{notice}</p>}{invite&&<div className="invite-box"><span>你的邀请码</span><strong>{invite}</strong><button onClick={()=>navigator.clipboard?.writeText(invite)}>复制邀请码</button></div>}<button className="text-button" onClick={signOut}>退出登录</button></section></main>;

  return <div className="app-shell"><header className="topbar"><div className="brand-small"><Heart fill="currentColor" size={18}/> BETWEEN</div><button className="avatar" title="退出登录" onClick={signOut}>{(profile?.display_name||'我').slice(0,1)}</button></header><main className="content"><div className="hello"><p className="eyebrow">YOUR LITTLE UNIVERSE</p><h1>有些日常，想和你分享。</h1><p className="muted">今天也记得，认真感受彼此。</p></div>
    {notice&&<div className="notice banner">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
    {tab==='home'&&<><section className="hero-card"><div className="hero-glow"></div><div className="hero-content"><span className="pill"><Sparkles size={13}/> ONLY US</span><p className="hero-label">我们已经一起走过</p><div className="days">{daysTogether ?? '—'}<small>天</small></div><p className="hero-sub">{anniversary?'从 '+anniversary+' 开始':'设置你们的纪念日，让时间有迹可循'}</p></div><Heart className="hero-heart" size={92} strokeWidth={1}/></section><div className="section-heading"><h2>今天的我们</h2><span>DAILY MOMENT</span></div><form className="panel stack" onSubmit={submitCheckin}><label>此刻的心情</label><div className="moods">{['🥰','😊','😌','🥺','😔','😤'].map(m=><button type="button" className={todayMood===m?'mood selected':'mood'} onClick={()=>setTodayMood(m)} key={m}>{m}</button>)}</div><textarea value={todayText} onChange={e=>setTodayText(e.target.value)} placeholder="今天有什么想和对方分享的？" rows="3"/><button className="primary" disabled={loading}>记录今天 <Send size={15}/></button></form><div className="section-heading"><h2>最近的心情</h2><span>LAST MOMENTS</span></div><div className="feed">{checkins.length?checkins.slice(0,5).map(c=><article className="feed-item" key={c.id}><div className="feed-mood">{c.mood}</div><div><strong>{c.profiles?.display_name||'我们中的一位'}</strong><p>{c.note||'留下了今天的心情'}</p><small>{c.checkin_date}</small></div></article>):<div className="empty">你们的第一条心情记录，会从这里开始。</div>}</div></>}
    {tab==='journal'&&<><div className="section-heading"><h2>共同日记</h2><span>OUR JOURNAL</span></div><form className="panel stack" onSubmit={addEntry}><textarea value={entryText} onChange={e=>setEntryText(e.target.value)} placeholder="把值得记住的小事写下来…" rows="4"/><button className="primary" disabled={loading||!entryText.trim()}>写入时光 <BookHeart size={16}/></button></form><div className="feed journal-feed">{entries.length?entries.map(x=><article className="journal-item" key={x.id}><p>{x.content}</p><div><strong>{x.profiles?.display_name||'我们中的一位'}</strong><small>{new Date(x.created_at).toLocaleString()}</small></div></article>):<div className="empty">还没有日记。第一篇，留给今天吧。</div>}</div></>}
    {tab==='dates'&&<><div className="section-heading"><h2>重要的日子</h2><span>SAVE THE DATE</span></div><section className="panel stack"><div className="date-icon"><CalendarDays size={25}/></div><h3>你们的纪念日</h3><p className="muted">把相遇的日子，好好收藏起来。</p><form onSubmit={saveAnniversary} className="stack"><label>开始日期<input type="date" value={anniversary} onChange={e=>setAnniversary(e.target.value)}/></label><button className="primary">保存日期</button></form>{daysTogether!==null&&<p className="date-count">已经一起走过 <strong>{daysTogether}</strong> 天</p>}</section></>}
    {tab==='chat'&&<section className="panel coming"><MessageCircle size={35}/><h2>聊天功能，下一站见</h2><p className="muted">第一版先把账号、绑定、心情和共同日记做好。实时聊天会作为下一阶段加入。</p></section>}
    <div className="privacy-note"><LockKeyhole size={14}/> 这是你们的双人空间，请只分享愿意让对方看到的内容。</div>
    </main><nav className="bottom-nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><HeartHandshake/><span>首页</span></button><button className={tab==='journal'?'active':''} onClick={()=>setTab('journal')}><BookHeart/><span>日记</span></button><button className={tab==='dates'?'active':''} onClick={()=>setTab('dates')}><CalendarDays/><span>纪念日</span></button><button className={tab==='chat'?'active':''} onClick={()=>setTab('chat')}><MessageCircle/><span>聊天</span></button></nav></div>;
}

function Setup(){return <main className="auth-shell"><div className="brand-mark"><Heart fill="currentColor"/><span>BETWEEN</span></div><section className="auth-card"><p className="eyebrow">FIRST-TIME SETUP</p><h1>再连上云端，就能一起使用了。</h1><p className="muted">当前是可运行的前端项目。要启用两部手机之间的真实账号和数据同步，需要先创建 Supabase 项目，并配置环境变量。</p><ol className="setup-list"><li>在 Supabase 创建一个免费项目。</li><li>复制 Project URL 和 anon/publishable key。</li><li>复制项目里的 <code>.env.example</code> 为 <code>.env.local</code>，填入这两项。</li><li>在 Supabase SQL Editor 运行 <code>supabase/schema.sql</code>。</li><li>运行 <code>npm install</code> 和 <code>npm run dev</code>。</li></ol><p className="notice">安全提醒：不要把 service_role 密钥放进前端，也不要把自己的密钥发到公开页面。</p></section></main>}

createRoot(document.getElementById('root')).render(<App/>);
