import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const RULES = [
  { num: 1, type: 'ALWAYS', text: 'Buckle up', icon: '/rule1.png' },
  { num: 2, type: 'ALWAYS', text: 'Drive safely within speed limits', icon: '/rule2.png' },
  { num: 3, type: 'ALWAYS', text: 'Keep eyes on road, hands on steering, stay alert', icon: '/rule3.png' },
  { num: 4, type: 'NEVER',  text: 'Drive or work while intoxicated', icon: '/rule4.png' },
  { num: 5, type: 'ALWAYS', text: 'Wear proper PPE and fall protection at height', icon: '/rule5.png' },
  { num: 6, type: 'ALWAYS', text: 'Use qualified electricians for electrical work', icon: '/rule6.png' },
  { num: 7, type: 'ALWAYS', text: 'Stay within safe zone and use insulated tools near powerlines', icon: '/rule7.png' },
  { num: 8, type: 'ALWAYS', text: 'Assign competent personnel for street and underground work', icon: '/rule8.png' },
];

export default function SafetyCommitmentPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [committed, setCommitted] = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), 100); }, []);

  const handleCommit = () => {
    setCommitted(true);
    setTimeout(() => navigate('/'), 800);
  };

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#042c53 0%,#0c447c 50%,#042c53 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 16px', fontFamily:"'Segoe UI',sans-serif", position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(45deg,rgba(255,255,255,0.02) 0px,rgba(255,255,255,0.02) 1px,transparent 1px,transparent 50px)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:'linear-gradient(90deg,#1d9e75,#0c447c,#1d9e75)' }} />

      <div style={{ maxWidth:900, width:'100%', opacity:visible?1:0, transform:visible?'translateY(0)':'translateY(20px)', transition:'all 0.6s ease' }}>

        <div style={{ textAlign:'center', marginBottom:24, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <img src="/logo.png" alt="Egypro" style={{ height:64, marginBottom:14 }} onError={e=>{e.target.style.display='none';}} />
          <div style={{ display:'inline-block', background:'rgba(29,158,117,0.15)', border:'1px solid rgba(29,158,117,0.4)', borderRadius:4, padding:'4px 14px', fontSize:11, fontWeight:700, letterSpacing:3, color:'#1d9e75', textTransform:'uppercase', marginBottom:12 }}>Zero Harm · Getting It Done Together</div>
          <h1 style={{ fontSize:24, fontWeight:800, color:'#ffffff', margin:'0 0 4px 0' }}>8 Absolute Rules</h1>
          <p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', margin:0, letterSpacing:1 }}>NO ONE GETS HURT. I DO THE RIGHT THING.</p>
        </div>

        <div style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderLeft:'4px solid #1d9e75', borderRadius:10, padding:'20px 24px', marginBottom:20, textAlign:'center' }}>
          <p style={{ fontSize:16, color:'rgba(255,255,255,0.92)', lineHeight:1.8, margin:0, fontStyle:'italic', fontWeight:400 }}>
            "We are our brothers' and sisters' keepers in the field. Safety is everyone's responsibility, and your input matters because it could save a life."
          </p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {RULES.map((rule, i) => (
            <div key={rule.num} style={{
              background: rule.type==='NEVER'
                ? 'linear-gradient(145deg, #fff5f5 0%, #ffe0e0 100%)'
                : 'linear-gradient(145deg, #ffffff 0%, #e8f0f7 100%)',
              border: rule.type==='NEVER' ? '1px solid #f5c0c0' : '1px solid #c8daea',
              borderRadius:12, padding:'16px 12px',
              display:'flex', flexDirection:'column', alignItems:'center', gap:8, textAlign:'center',
              boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
              backdropFilter:'blur(4px)',
              opacity:visible?1:0,
              transform:visible?'translateY(0)':'translateY(10px)',
              transition:'all 0.5s ease '+(0.1+i*0.07)+'s',
            }}>
              <img src={rule.icon} alt={'Rule '+rule.num} style={{ width:58, height:58, objectFit:'contain' }} />
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:1.5, color:rule.type==='NEVER'?'#c0392b':'#0f6e56', textTransform:'uppercase' }}>{rule.type}</div>
              <div style={{ fontSize:14, color:'#0c447c', lineHeight:1.5, fontWeight:500 }}>{rule.text}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign:'center' }}>
          <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:14 }}>
            By proceeding, you commit to upholding these rules and keeping your team safe.
          </p>
          <button onClick={handleCommit} disabled={committed} style={{
            background:'linear-gradient(135deg,#1d9e75,#0f6e56)',
            border:'none', borderRadius:8, padding:'14px 48px',
            fontSize:15, fontWeight:700, color:'#ffffff',
            cursor:committed?'default':'pointer',
            boxShadow:'0 4px 20px rgba(29,158,117,0.4)',
            opacity:committed?0.8:1, transition:'all 0.3s ease',
          }}>
            {committed ? '✓ Committed — Entering ESAT...' : '🤝 I Commit to Safety — Enter ESAT'}
          </button>
        </div>
      </div>

      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:4, background:'linear-gradient(90deg,#1d9e75,#0c447c,#1d9e75)' }} />
    </div>
  );
}
