import React, {useEffect, useState} from 'react';
import {Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import * as SQLite from 'expo-sqlite';

const CATEGORIES = ['Makan','Transportasi','Game','Rokok','Belanja','Lainnya'];
const dbPromise = SQLite.openDatabaseAsync('keuangan.db');

const todayKey = () => {
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${m}-${day}`;
};
const rupiah = n => 'Rp' + Math.round(Number(n)||0).toLocaleString('id-ID');
const parseAmount = s => {
  const digits = String(s).replace(/\D/g,'');
  return digits ? Number(digits) : 0;
};

async function initDb() {
  const db = await dbPromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT,
      note TEXT,
      createdAt TEXT NOT NULL,
      localDateKey TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(localDateKey);
    CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(createdAt);
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id=1),
      dailyLimit INTEGER
    );
  `);
}
async function allTx() {
  const db = await dbPromise;
  return db.getAllAsync('SELECT * FROM transactions ORDER BY createdAt DESC');
}
async function addTx(type, amount, category, note) {
  const db = await dbPromise;
  await db.runAsync(
    'INSERT INTO transactions (type,amount,category,note,createdAt,localDateKey) VALUES (?,?,?,?,?,?)',
    type, amount, category || null, note || null, new Date().toISOString(), todayKey()
  );
}
async function deleteTx(id) {
  const db = await dbPromise;
  await db.runAsync('DELETE FROM transactions WHERE id=?', id);
}
async function getLimit() {
  const db = await dbPromise;
  const row = await db.getFirstAsync('SELECT dailyLimit FROM settings WHERE id=1');
  return row?.dailyLimit ?? null;
}
async function saveLimit(value) {
  const db = await dbPromise;
  await db.runAsync('INSERT OR REPLACE INTO settings(id,dailyLimit) VALUES(1,?)', value);
}
async function clearAll() {
  const db = await dbPromise;
  await db.runAsync('DELETE FROM transactions');
}

export default function App() {
  const [screen,setScreen] = useState('dashboard');
  const [tx,setTx] = useState([]);
  const [limit,setLimit] = useState(null);
  const [type,setType] = useState('expense');
  const [amount,setAmount] = useState('');
  const [note,setNote] = useState('');
  const [category,setCategory] = useState('Makan');
  const [limitInput,setLimitInput] = useState('');
  const [busy,setBusy] = useState(false);

  const refresh = async () => { setTx(await allTx()); setLimit(await getLimit()); };
  useEffect(()=>{ (async()=>{await initDb(); await refresh();})(); },[]);

  const today = todayKey();
  const income = tx.filter(x=>x.type==='income').reduce((a,x)=>a+x.amount,0);
  const expense = tx.filter(x=>x.type==='expense').reduce((a,x)=>a+x.amount,0);
  const todayIncome = tx.filter(x=>x.type==='income'&&x.localDateKey===today).reduce((a,x)=>a+x.amount,0);
  const todayExpense = tx.filter(x=>x.type==='expense'&&x.localDateKey===today).reduce((a,x)=>a+x.amount,0);
  const status = limit == null ? null : todayExpense <= limit;

  const save = async () => {
    const n=parseAmount(amount);
    if(!n || n<=0 || !Number.isSafeInteger(n)) return Alert.alert('Nominal tidak valid','Masukkan nominal Rupiah positif tanpa desimal.');
    if(type==='expense' && !category) return Alert.alert('Kategori','Pilih kategori pengeluaran.');
    setBusy(true);
    await addTx(type,n,type==='expense'?category:null,note.trim());
    setAmount(''); setNote(''); setBusy(false); await refresh(); setScreen('dashboard');
  };

  const remove = id => Alert.alert('Hapus transaksi?','Data ini akan dihapus.',[
    {text:'Batal',style:'cancel'},
    {text:'Hapus',style:'destructive',onPress:async()=>{await deleteTx(id);await refresh();}}
  ]);

  const saveDailyLimit = async () => {
    const n=parseAmount(limitInput);
    if(!n || !Number.isSafeInteger(n)) return Alert.alert('Batas tidak valid','Masukkan nominal Rupiah positif.');
    await saveLimit(n); setLimit(n); setLimitInput(''); Alert.alert('Tersimpan','Batas harian berhasil disimpan.');
  };

  const clear = () => Alert.alert('Hapus semua data?','Semua transaksi akan hilang permanen.',[
    {text:'Batal',style:'cancel'},
    {text:'Hapus Semua',style:'destructive',onPress:async()=>{await clearAll();await refresh();}}
  ]);

  const Header=({title})=><View style={styles.header}><Text style={styles.title}>{title}</Text></View>;

  if(screen==='form') return <SafeAreaView style={styles.safe}>
    <Header title={type==='income'?'Tambah Pemasukan':'Tambah Pengeluaran'}/>
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.label}>Nominal</Text>
      <TextInput style={styles.input} keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder="Contoh 10000"/>
      {amount ? <Text style={styles.preview}>{rupiah(parseAmount(amount))}</Text>:null}
      {type==='expense' && <>
        <Text style={styles.label}>Kategori</Text>
        <View style={styles.wrap}>{CATEGORIES.map(c=><Pressable key={c} onPress={()=>setCategory(c)} style={[styles.chip,category===c&&styles.chipOn]}><Text style={category===c?styles.chipTextOn:styles.chipText}>{c}</Text></Pressable>)}</View>
      </>}
      <Text style={styles.label}>Catatan / Barang (opsional)</Text>
      <TextInput style={[styles.input,styles.multiline]} value={note} onChangeText={setNote} placeholder="Contoh: nasi goreng" multiline/>
      <Pressable disabled={busy} onPress={save} style={styles.primary}><Text style={styles.primaryText}>{busy?'Menyimpan...':'Simpan'}</Text></Pressable>
      <Pressable onPress={()=>setScreen('dashboard')} style={styles.secondary}><Text>Kembali</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;

  if(screen==='history') return <SafeAreaView style={styles.safe}>
    <Header title="Riwayat Transaksi"/>
    <ScrollView contentContainerStyle={styles.pad}>{tx.length===0?<Text style={styles.empty}>Belum ada transaksi.</Text>:tx.map(x=><View key={x.id} style={styles.row}>
      <View style={{flex:1}}><Text style={styles.rowTitle}>{x.type==='income'?'Pemasukan':'Pengeluaran'} {x.category?`• ${x.category}`:''}</Text><Text style={styles.muted}>{x.localDateKey}{x.note?` • ${x.note}`:''}</Text></View>
      <Text style={x.type==='income'?styles.income:styles.expense}>{x.type==='income'?'+':'-'}{rupiah(x.amount)}</Text>
      <Pressable onPress={()=>remove(x.id)}><Text style={styles.delete}>Hapus</Text></Pressable>
    </View>)}</ScrollView>
    <Nav screen={screen} setScreen={setScreen}/>
  </SafeAreaView>;

  if(screen==='settings') return <SafeAreaView style={styles.safe}>
    <Header title="Pengaturan"/>
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.label}>Batas pengeluaran harian</Text>
      <Text style={styles.muted}>{limit==null?'Belum ada batas harian':rupiah(limit)}</Text>
      <TextInput style={styles.input} keyboardType="number-pad" value={limitInput} onChangeText={setLimitInput} placeholder="Contoh 100000"/>
      <Pressable onPress={saveDailyLimit} style={styles.primary}><Text style={styles.primaryText}>Simpan Batas</Text></Pressable>
      <View style={styles.warning}><Text style={styles.warningTitle}>Peringatan data</Text><Text>Data disimpan hanya di HP. Menghapus penyimpanan aplikasi atau uninstall akan menghapus semua catatan secara permanen.</Text></View>
      <Pressable onPress={clear} style={styles.danger}><Text style={styles.primaryText}>Hapus Semua Data</Text></Pressable>
    </ScrollView>
    <Nav screen={screen} setScreen={setScreen}/>
  </SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <Header title="Keuangan Harian"/>
    <ScrollView contentContainerStyle={styles.pad}>
      <View style={styles.card}><Text style={styles.muted}>Saldo Saat Ini</Text><Text style={styles.balance}>{rupiah(income-expense)}</Text></View>
      <View style={styles.grid}><Stat title="Pemasukan Hari Ini" value={rupiah(todayIncome)} good/><Stat title="Pengeluaran Hari Ini" value={rupiah(todayExpense)}/></View>
      <View style={[styles.status,status===null?styles.neutral:status?styles.good:styles.bad]}>
        <Text style={styles.statusTitle}>{status===null?'Belum ada batas harian':status?'BAIK — Tidak Boros':'BOROS'}</Text>
        {limit!=null&&<Text>{rupiah(todayExpense)} dari {rupiah(limit)} hari ini</Text>}
      </View>
      <Pressable onPress={()=>{setType('income');setScreen('form')}} style={styles.primary}><Text style={styles.primaryText}>+ Pemasukan</Text></Pressable>
      <Pressable onPress={()=>{setType('expense');setScreen('form')}} style={styles.secondary}><Text>+ Pengeluaran</Text></Pressable>
      <Pressable onPress={()=>setScreen('history')} style={styles.secondary}><Text>Lihat Riwayat</Text></Pressable>
    </ScrollView>
    <Nav screen={screen} setScreen={setScreen}/>
  </SafeAreaView>;
}

function Stat({title,value}){return <View style={styles.stat}><Text style={styles.muted}>{title}</Text><Text style={styles.statValue}>{value}</Text></View>}
function Nav({screen,setScreen}){return <View style={styles.nav}>{[['dashboard','Ringkasan'],['history','Riwayat'],['settings','Pengaturan']].map(([s,l])=><Pressable key={s} onPress={()=>setScreen(s)} style={styles.navItem}><Text style={screen===s?styles.navOn:styles.navOff}>{l}</Text></Pressable>)}</View>}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#F9F8F6'},pad:{padding:18,paddingBottom:100},header:{paddingHorizontal:18,paddingTop:12,paddingBottom:8},title:{fontSize:25,fontWeight:'800',color:'#173B2A'},card:{backgroundColor:'#E9F2EC',borderRadius:20,padding:22,marginBottom:14},balance:{fontSize:32,fontWeight:'900',color:'#2E5A44',marginTop:5},grid:{flexDirection:'row',gap:10,marginBottom:12},stat:{flex:1,backgroundColor:'#fff',padding:15,borderRadius:16},statValue:{fontSize:17,fontWeight:'800',marginTop:6},muted:{color:'#66736C'},status:{padding:18,borderRadius:16,marginBottom:14},statusTitle:{fontSize:18,fontWeight:'800',marginBottom:4},good:{backgroundColor:'#DDEFE3'},bad:{backgroundColor:'#F8DFDB'},neutral:{backgroundColor:'#ECECEA'},primary:{backgroundColor:'#2E5A44',padding:16,borderRadius:14,alignItems:'center',marginTop:10},primaryText:{color:'#fff',fontWeight:'800'},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D9DDD9',padding:15,borderRadius:14,alignItems:'center',marginTop:10},danger:{backgroundColor:'#B83A2E',padding:16,borderRadius:14,alignItems:'center',marginTop:20},label:{fontWeight:'800',marginTop:16,marginBottom:8,color:'#26352D'},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D9DDD9',borderRadius:12,padding:14,fontSize:16},multiline:{minHeight:90,textAlignVertical:'top'},preview:{fontSize:20,fontWeight:'800',color:'#2E5A44',marginTop:8},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingHorizontal:14,paddingVertical:10,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#D9DDD9'},chipOn:{backgroundColor:'#2E5A44',borderColor:'#2E5A44'},chipTextOn:{color:'#fff',fontWeight:'700'},chipText:{color:'#26352D'},row:{backgroundColor:'#fff',padding:14,borderRadius:14,marginBottom:9,flexDirection:'row',alignItems:'center',gap:8},rowTitle:{fontWeight:'800'},income:{color:'#2E5A44',fontWeight:'800'},expense:{color:'#B83A2E',fontWeight:'800'},delete:{color:'#B83A2E',fontSize:12,fontWeight:'700'},empty:{textAlign:'center',marginTop:40,color:'#66736C'},warning:{backgroundColor:'#FFF2DF',padding:15,borderRadius:14,marginTop:24},warningTitle:{fontWeight:'800',marginBottom:5},nav:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'#fff',borderTopWidth:1,borderColor:'#E2E4E2',flexDirection:'row',paddingBottom:10,paddingTop:10},navItem:{flex:1,alignItems:'center',padding:8},navOn:{color:'#2E5A44',fontWeight:'900'},navOff:{color:'#66736C'}
});
