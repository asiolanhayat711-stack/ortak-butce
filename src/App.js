import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const SUPABASE_URL = "https://bozvzuxvqlcuomxukevl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_V9OcPud3Tj53Fyh2dy-AKQ_4VhAToaV";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const RENKLER = ['#22c55e', '#ef4444'];

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Uygulama Durumları
  const [islemler, setIslemler] = useState([]);
  const [bankalar, setBankalar] = useState([]);
  const [duzenliOdemeler, setDuzenliOdemeler] = useState([]);

  // Form Durumları
  const [ay, setAy] = useState('2026-08');
  const [tarih, setTarih] = useState(new Date().toISOString().split('T')[0]);
  const [baslik, setBaslik] = useState('');
  const [miktar, setMiktar] = useState('');
  const [type, setType] = useState('gider');
  const [secilenBanka, setSecilenBanka] = useState('');

  // Ekleme Durumları
  const [yeniBanka, setYeniBanka] = useState('');
  const [yeniBankaBakiye, setYeniBankaBakiye] = useState('');
  const [yeniOdeme, setYeniOdeme] = useState('');

  // UI Durumları
  const [acikBankaId, setAcikBankaId] = useState(null);
  const [virmanAcik, setVirmanAcik] = useState(false);
  const [virmanCikis, setVirmanCikis] = useState('');
  const [virmanGiris, setVirmanGiris] = useState('');
  const [virmanMiktar, setVirmanMiktar] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      tumVerileriCek();
    }
  }, [ay, session]);

  // KULLANICI GİRİŞ / KAYIT İŞLEMLERİ
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (isRegistering) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setLoginError(error.message);
      else alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setLoginError(error.message);
    }
  };

  const tumVerileriCek = async () => {
    const userId = session.user.id;
    try {
      const { data: islemData } = await supabase.from('islem').select('*').eq('ay', ay).eq('user_id', userId).order('tarih', { ascending: false });
      const { data: bankaData } = await supabase.from('banka').select('*').eq('user_id', userId);
      const { data: duzenliData } = await supabase.from('duzenli_odeme').select('*').eq('user_id', userId);

      if (islemData) setIslemler(islemData);
      if (bankaData) {
        setBankalar(bankaData);
        if (bankaData.length > 0 && !secilenBanka) setSecilenBanka(bankaData[0].banka_adi);
      }
      if (duzenliData) setDuzenliOdemeler(duzenliData);
    } catch (err) {
      console.error("Veri çekme hatası:", err);
    }
  };

  const islemEkle = async (e) => {
    e.preventDefault();
    const aktifBanka = secilenBanka || (bankalar.length > 0 ? bankalar[0].banka_adi : '');
    if (!baslik || !miktar || !aktifBanka || !tarih) return alert("Lütfen gerekli alanları doldurun.");

    const yeniIslem = { 
      ay, tarih, baslik, miktar: Number(miktar), type, banka_adi: aktifBanka, user_id: session.user.id 
    };

    const { data, error } = await supabase.from('islem').insert([yeniIslem]).select();
    if (error) return alert("Hata: " + error.message);

    if (data) {
      setIslemler(prev => [data[0], ...prev]);
      const banka = bankalar.find(b => b.banka_adi === aktifBanka);
      if (banka) {
        const yeniBakiye = type === 'gider' ? Number(banka.bakiye) - Number(miktar) : Number(banka.bakiye) + Number(miktar);
        await supabase.from('banka').update({ bakiye: yeniBakiye }).eq('id', banka.id);
        setBankalar(bankalar.map(b => b.id === banka.id ? { ...b, bakiye: yeniBakiye } : b));
      }

      if (type === 'gider') {
        const eslesenOdeme = duzenliOdemeler.find(
          o => o.odeme_adi.trim().toLowerCase() === baslik.trim().toLowerCase()
        );
        if (eslesenOdeme) {
          await supabase.from('duzenli_odeme').update({ durum: 'Ödendi' }).eq('id', eslesenOdeme.id);
          setDuzenliOdemeler(prev => prev.map(o => o.id === eslesenOdeme.id ? { ...o, durum: 'Ödendi' } : o));
        }
      }

      setBaslik(''); setMiktar('');
    }
  };

  const islemSil = async (id, miktar, type, bankaAdi, silinenBaslik) => {
    if (!window.confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;

    const { error } = await supabase.from('islem').delete().eq('id', id);
    if (error) return alert("Silme hatası: " + error.message);

    setIslemler(islemler.filter(i => i.id !== id));

    const banka = bankalar.find(b => b.banka_adi === bankaAdi);
    if (banka) {
      const yeniBakiye = type === 'gider' ? Number(banka.bakiye) + Number(miktar) : Number(banka.bakiye) - Number(miktar);
      await supabase.from('banka').update({ bakiye: yeniBakiye }).eq('id', banka.id);
      setBankalar(bankalar.map(b => b.id === banka.id ? { ...b, bakiye: yeniBakiye } : b));
    }

    if (type === 'gider') {
      const eslesenOdeme = duzenliOdemeler.find(
        o => o.odeme_adi.trim().toLowerCase() === silinenBaslik.trim().toLowerCase()
      );
      if (eslesenOdeme) {
        await supabase.from('duzenli_odeme').update({ durum: 'Ödenmedi' }).eq('id', eslesenOdeme.id);
        setDuzenliOdemeler(prev => prev.map(o => o.id === eslesenOdeme.id ? { ...o, durum: 'Ödenmedi' } : o));
      }
    }
  };

  const bankaEkle = async () => {
    if (!yeniBanka) return;
    const { data, error } = await supabase.from('banka').insert([{ banka_adi: yeniBanka, bakiye: Number(yeniBankaBakiye) || 0, user_id: session.user.id }]).select();
    if (error) alert("Banka ekleme hatası: " + error.message);
    if (data) {
      setBankalar([...bankalar, ...data]);
      if (!secilenBanka) setSecilenBanka(data[0].banka_adi);
    }
    setYeniBanka(''); setYeniBankaBakiye('');
  };

  const odemeEkle = async () => {
    if (!yeniOdeme) return;
    const { data, error } = await supabase.from('duzenli_odeme').insert([{ odeme_adi: yeniOdeme, durum: 'Ödenmedi', miktar: 0, user_id: session.user.id }]).select();
    if (error) alert("Düzenli ödeme ekleme hatası: " + error.message);
    if (data) setDuzenliOdemeler([...duzenliOdemeler, ...data]);
    setYeniOdeme('');
  };

  const duzenliOdemeSil = async (id) => {
    const { error } = await supabase.from('duzenli_odeme').delete().eq('id', id);
    if (error) return alert("Silme hatası: " + error.message);
    setDuzenliOdemeler(duzenliOdemeler.filter(o => o.id !== id));
  };

  const durumDegistir = async (id, mevcutDurum) => {
    const yeniDurum = mevcutDurum === 'Ödendi' ? 'Ödenmedi' : 'Ödendi';
    await supabase.from('duzenli_odeme').update({ durum: yeniDurum }).eq('id', id);
    setDuzenliOdemeler(duzenliOdemeler.map(o => o.id === id ? { ...o, durum: yeniDurum } : o));
  };

  const virmanYap = async () => {
    if (!virmanCikis || !virmanGiris || !virmanMiktar || virmanCikis === virmanGiris) return alert("Geçerli işlem seçin.");
    const m = Number(virmanMiktar);
    const b1 = bankalar.find(b => b.banka_adi === virmanCikis);
    const b2 = bankalar.find(b => b.banka_adi === virmanGiris);

    if (b1 && b2) {
      await supabase.from('banka').update({ bakiye: Number(b1.bakiye) - m }).eq('id', b1.id);
      await supabase.from('banka').update({ bakiye: Number(b2.bakiye) + m }).eq('id', b2.id);

      setBankalar(bankalar.map(b => {
        if (b.id === b1.id) return { ...b, bakiye: Number(b.bakiye) - m };
        if (b.id === b2.id) return { ...b, bakiye: Number(b.bakiye) + m };
        return b;
      }));

      setVirmanAcik(false); setVirmanMiktar('');
    }
  };

  const sonrakiAyaAktar = async () => {
    const devirMiktari = toplamGelir - toplamGider;
    const [yil, ayNum] = ay.split('-').map(Number);
    let yeniAyNum = ayNum + 1;
    let yeniYil = yil;
    if (yeniAyNum > 12) { yeniAyNum = 1; yeniYil++; }
    const sonrakiAyStr = `${yeniYil}-${String(yeniAyNum).padStart(2, '0')}`;

    if (devirMiktari <= 0) return alert("Aktarılacak pozitif bakiye yok.");
    if (bankalar.length === 0) return alert("Devir için önce en az bir banka eklemelisiniz.");

    const devirIslem = {
      ay: sonrakiAyStr,
      tarih: `${sonrakiAyStr}-01`,
      baslik: `Devreden Bakiye (${ay})`,
      miktar: devirMiktari,
      type: 'gelir',
      banka_adi: bankalar[0].banka_adi,
      user_id: session.user.id
    };

    const { error } = await supabase.from('islem').insert([devirIslem]);

    if (error) {
      return alert("Devir Hatası: " + error.message);
    } else {
      alert(`Kalan ${devirMiktari} ₺ bakiye ${sonrakiAyStr} ayına devredildi!`);
      setAy(sonrakiAyStr);
    }
  };

  const toplamGelir = islemler.filter(i => i.type === 'gelir').reduce((acc, i) => acc + Number(i.miktar), 0);
  const toplamGider = islemler.filter(i => i.type === 'gider').reduce((acc, i) => acc + Number(i.miktar), 0);
  const toplamBankaBakiye = bankalar.reduce((acc, b) => acc + Number(b.bakiye || 0), 0);
  const grafikVerisi = [{ name: 'Gelir', value: toplamGelir }, { name: 'Gider', value: toplamGider }].filter(item => item.value > 0);

  // GİRİŞ / KAYIT EKRANI
  if (!session) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f4f6f8', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleAuth} style={{ padding: '35px', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '300px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0, color: '#1e293b' }}>Ortak Bütçe</h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>{isRegistering ? 'Yeni Hesap Oluştur' : 'Giriş Yapın'}</p>
          {loginError && <p style={{ color: '#ef4444', fontSize: '13px' }}>{loginError}</p>}
          
          <input type="email" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} required />
          <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} required />
          
          <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isRegistering ? 'Kayıt Ol' : 'Giriş Yap'}
          </button>
          
          <p onClick={() => setIsRegistering(!isRegistering)} style={{ fontSize: '12px', color: '#2563eb', cursor: 'pointer', marginTop: '15px' }}>
            {isRegistering ? 'Zaten hesabınız var mı? Giriş Yapın' : 'Hesabınız yok mu? Kayıt Olun'}
          </p>
        </form>
      </div>
    );
  }

  // UYGULAMA EKRANI
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f4f6f8', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', color: '#fff', padding: '10px 25px' }}>
        <span style={{ fontWeight: 'bold' }}>Ortak Bütçe Takip ({session.user.email})</span>
        <button onClick={() => supabase.auth.signOut()} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}>Çıkış Yap</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px', padding: '20px', boxSizing: 'border-box', flex: 1 }}>
        
        {/* SOL: DÜZENLİ ÖDEMELER & YAPILAN İŞLEMLER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3>📅 Düzenli Ödemeler</h3>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <input type="text" placeholder="Ödeme Adı" value={yeniOdeme} onChange={e => setYeniOdeme(e.target.value)} style={{ flex: 1, padding: '6px' }} />
              <button onClick={odemeEkle} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Ekle</button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {duzenliOdemeler.map(o => (
                <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <span onClick={() => setBaslik(o.odeme_adi)} style={{ cursor: 'pointer', fontWeight: 'bold', color: o.durum === 'Ödendi' ? '#16a34a' : '#333' }}>
                    {o.odeme_adi} {o.durum === 'Ödendi' && '✓'}
                  </span>
                  <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <button onClick={() => durumDegistir(o.id, o.durum)} style={{ background: o.durum === 'Ödendi' ? '#22c55e' : '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      {o.durum}
                    </button>
                    <button onClick={() => duzenliOdemeSil(o.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '14px' }} title="Sil">🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3>📋 Yapılan İşlemler</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {islemler.map(i => (
                <li key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <div>
                    <div style={{ fontWeight: '500' }}>{i.baslik}</div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                      📅 {i.tarih} | 🏦 {i.banka_adi}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: i.type === 'gelir' ? 'green' : 'red', fontWeight: 'bold' }}>
                      {i.type === 'gelir' ? '+' : '-'}{i.miktar}₺
                    </span>
                    <button onClick={() => islemSil(i.id, i.miktar, i.type, i.banka_adi, i.baslik)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', padding: '2px 4px' }} title="İşlemi Sil">🗑️</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ORTA: ANA BÜTÇE */}
        <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ textAlign: 'center', marginTop: 0 }}>Ortak Bütçe & Takip</h2>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Dönem:</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="month" value={ay} onChange={e => setAy(e.target.value)} style={{ flex: 1, padding: '6px' }} />
              <button onClick={sonrakiAyaAktar} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                Sonraki Aya Aktar ➔
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', background: '#f8f9fa', padding: '10px', borderRadius: '6px', marginBottom: '15px', textAlign: 'center' }}>
            <div><small>Gelir</small><h4 style={{ color: 'green', margin: 0 }}>+{toplamGelir}₺</h4></div>
            <div><small>Gider</small><h4 style={{ color: 'red', margin: 0 }}>-{toplamGider}₺</h4></div>
            <div><small>Toplam Banka Hesaplarımdaki Para Miktarı</small><h4 style={{ margin: 0, color: '#2563eb' }}>{toplamBankaBakiye}₺</h4></div>
          </div>

          <form onSubmit={islemEkle} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
            <label style={{ fontSize: '12px', color: '#555' }}>İşlem Tarihi:</label>
            <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} style={{ padding: '8px' }} />
            
            <input type="text" placeholder="İşlem Başlığı (Örn: KİRA)" value={baslik} onChange={e => setBaslik(e.target.value)} style={{ padding: '8px' }} />
            <input type="number" placeholder="Miktar (₺)" value={miktar} onChange={e => setMiktar(e.target.value)} style={{ padding: '8px' }} />
            
            <select value={secilenBanka} onChange={e => setSecilenBanka(e.target.value)} style={{ padding: '8px' }}>
              {bankalar.length === 0 && <option value="">Önce Sağdan Banka Ekleyin</option>}
              {bankalar.map(b => <option key={b.id} value={b.banka_adi}>{b.banka_adi}</option>)}
            </select>

            <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '8px' }}>
              <option value="gider">Gider</option>
              <option value="gelir">Gelir</option>
            </select>
            <button type="submit" style={{ padding: '10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Ekle</button>
          </form>

          {grafikVerisi.length > 0 && (
            <div style={{ height: 160 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={grafikVerisi} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value">
                    {grafikVerisi.map((e, idx) => <Cell key={idx} fill={e.name === 'Gelir' ? RENKLER[0] : RENKLER[1]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* SAĞ: BANKALAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>🏦 Bankalarım</h3>
              <button onClick={() => setVirmanAcik(!virmanAcik)} style={{ padding: '6px 10px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>⇄ Virman Yap</button>
            </div>

            {virmanAcik && (
              <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '6px', marginBottom: '10px' }}>
                <small><b>Bankalar Arası Virman:</b></small>
                <select onChange={e => setVirmanCikis(e.target.value)} style={{ width: '100%', margin: '4px 0', padding: '4px' }}>
                  <option value="">Çıkış Hesabı</option>
                  {bankalar.map(b => <option key={b.id} value={b.banka_adi}>{b.banka_adi}</option>)}
                </select>
                <select onChange={e => setVirmanGiris(e.target.value)} style={{ width: '100%', margin: '4px 0', padding: '4px' }}>
                  <option value="">Giriş Hesabı</option>
                  {bankalar.map(b => <option key={b.id} value={b.banka_adi}>{b.banka_adi}</option>)}
                </select>
                <input type="number" placeholder="Miktar" value={virmanMiktar} onChange={e => setVirmanMiktar(e.target.value)} style={{ width: '96%', padding: '4px', marginBottom: '4px' }} />
                <button onClick={virmanYap} style={{ width: '100%', background: '#0369a1', color: '#fff', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>Aktar</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
              <input type="text" placeholder="Banka Adı" value={yeniBanka} onChange={e => setYeniBanka(e.target.value)} style={{ flex: 1, padding: '4px' }} />
              <input type="number" placeholder="Bakiye" value={yeniBankaBakiye} onChange={e => setYeniBankaBakiye(e.target.value)} style={{ width: '60px', padding: '4px' }} />
              <button onClick={bankaEkle} style={{ cursor: 'pointer' }}>+</button>
            </div>

            <ul style={{ listStyle: 'none', padding: 0 }}>
              {bankalar.map(b => (
                <li key={b.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0', cursor: 'pointer' }} onClick={() => setAcikBankaId(acikBankaId === b.id ? null : b.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>{acikBankaId === b.id ? '▼' : '►'} {b.banka_adi}</span>
                  </div>
                  {acikBankaId === b.id && (
                    <div style={{ background: '#f1f5f9', padding: '8px', borderRadius: '4px', marginTop: '5px', fontSize: '13px', color: '#334155' }}>
                      Kalan Bakiye: <strong>{b.bakiye} ₺</strong>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
