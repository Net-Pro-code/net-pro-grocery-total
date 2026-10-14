import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Vibration,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
 
const CURRENT_KEY = 'grocery_current';
const HISTORY_KEY = 'grocery_history';
 
// Alert.alert does nothing in a web browser, so use the browser's own dialogs there
function notify(title, message) {
  if (Platform.OS === 'web') {
    window.alert(message ? title + '\n\n' + message : title);
  } else {
    Alert.alert(title, message);
  }
}
 
function confirmAction(title, message, confirmLabel, onConfirm) {
  if (Platform.OS === 'web') {
    if (window.confirm(title + '\n\n' + message)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}
 
// Same QR code seen again within this many milliseconds is ignored
// (stops one scan from adding twice). Lower = faster repeat scanning.
const SCAN_DELAY = 1500;
const MAX_QTY = 9999;
 
// ---------- helpers ----------
 
// QR format: "Rice 2kg,4500"  (name,price) - price is the part after the LAST comma
function parseQR(data) {
  if (typeof data !== 'string') return null;
  const idx = data.lastIndexOf(',');
  if (idx === -1) return null;
  const name = data.slice(0, idx).trim();
  const priceText = data
    .slice(idx + 1)
    .replace(/mwk/gi, '')
    .replace(/\s/g, '');
  if (!name || !/^\d+(\.\d+)?$/.test(priceText)) return null;
  return { name, price: parseFloat(priceText) };
}
 
function formatMWK(n) {
  const [whole, dec] = Number(n).toFixed(2).split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return 'MWK ' + (dec === '00' ? withCommas : withCommas + '.' + dec);
}
 
const qtyOf = (i) => i.qty || 1; // older saved items have no qty
const lineTotal = (i) => i.price * qtyOf(i);
const sumItems = (items) => items.reduce((s, i) => s + lineTotal(i), 0);
const countUnits = (items) => items.reduce((s, i) => s + qtyOf(i), 0);
 
function formatDate(iso) {
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}  ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
 
// ---------- app ----------
 
export default function App() {
  const [tab, setTab] = useState('scan');
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('Scan QR Code');
  const [messageType, setMessageType] = useState('info'); // info | ok | error
  const [expandedId, setExpandedId] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef({ data: null, time: 0 });
 
  // manual "Add item" form
  const [manualOpen, setManualOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mPrice, setMPrice] = useState('');
  const [mQty, setMQty] = useState('1');
 
  // load saved data
  useEffect(() => {
    (async () => {
      try {
        const cur = await AsyncStorage.getItem(CURRENT_KEY);
        const hist = await AsyncStorage.getItem(HISTORY_KEY);
        if (cur) setItems(JSON.parse(cur).map((i) => ({ ...i, qty: qtyOf(i) })));
        if (hist) setHistory(JSON.parse(hist));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);
 
  // keep the in-progress list and history saved
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(CURRENT_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, loaded]);
 
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
  }, [history, loaded]);
 
  const total = sumItems(items);
  const units = countUnits(items);
 
  function handleScan({ data }) {
    const now = Date.now();
    if (lastScan.current.data === data && now - lastScan.current.time < SCAN_DELAY) return;
    lastScan.current = { data, time: now };
 
    const parsed = parseQR(data);
    if (!parsed) {
      Vibration.vibrate([0, 150, 100, 150]);
      setMessageType('error');
      setMessage('Unreadable code. Expected: name,price');
      return;
    }
    Vibration.vibrate(80);
    addToList(parsed, 1);
    setMessageType('ok');
    setMessage(`Added: ${parsed.name}  ${formatMWK(parsed.price)}`);
  }
 
  // same item (same name and price) -> add to its quantity, move it to the top
  function addToList(parsed, count) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.name === parsed.name && i.price === parsed.price);
      if (idx >= 0) {
        const updated = { ...prev[idx], qty: Math.min(qtyOf(prev[idx]) + count, MAX_QTY) };
        return [updated, ...prev.filter((_, k) => k !== idx)];
      }
      return [
        {
          id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
          ...parsed,
          qty: Math.min(count, MAX_QTY),
        },
        ...prev,
      ];
    });
  }
 
  // ----- manual entry (no QR code needed) -----
  function openManual() {
    setMName('');
    setMPrice('');
    setMQty('1');
    setManualOpen(true);
  }
 
  function submitManual() {
    const name = mName.trim();
    const priceText = mPrice.replace(/,/g, '').replace(/mwk/gi, '').replace(/\s/g, '');
    const price = parseFloat(priceText);
    const qty = parseInt(mQty.replace(/[^0-9]/g, ''), 10) || 1;
 
    if (!name) {
      notify('Missing name', 'Type the item name.');
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(priceText) || !(price > 0)) {
      notify('Invalid price', 'Type the price as a number, e.g. 4500');
      return;
    }
    addToList({ name, price }, qty);
    setManualOpen(false);
    setMessageType('ok');
    setMessage(`Added: ${name}${qty > 1 ? ' × ' + qty : ''}`);
  }
 
  function changeQty(id, delta) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, qty: Math.min(Math.max(qtyOf(i) + delta, 1), MAX_QTY) } : i
      )
    );
  }
 
  function setQty(id, text) {
    const n = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
    const qty = !n || n < 1 ? 1 : Math.min(n, MAX_QTY);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty } : i)));
  }
 
  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }
 
  function clearAll() {
    if (items.length === 0) return;
    confirmAction('Clear list?', 'This removes all scanned items.', 'Clear', () => setItems([]));
  }
 
  function saveList() {
    if (items.length === 0) {
      notify('Nothing to save', 'Scan at least one item first.');
      return;
    }
    const entry = {
      id: String(Date.now()),
      date: new Date().toISOString(),
      total,
      items,
    };
    setHistory((prev) => [entry, ...prev]);
    setItems([]);
    setMessageType('info');
    setMessage('List saved. Scan QR Code');
    notify('Saved', `Total ${formatMWK(total)} saved to History.`);
  }
 
  function deleteHistory(id) {
    confirmAction('Delete this list?', 'This cannot be undone.', 'Delete', () =>
      setHistory((prev) => prev.filter((h) => h.id !== id))
    );
  }
 
  // ---------- screens ----------
 
  function renderScan() {
    const cameraReady = !!(permission && permission.granted);
    return (
      <View style={{ flex: 1 }}>
        {/* Camera with corner-only frame and hint label on top */}
        <View style={styles.cameraWrap}>
          {cameraReady ? (
            <>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleScan}
              />
              <View style={styles.frame} pointerEvents="none">
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />
              </View>
            </>
          ) : (
            <View style={styles.noCamera}>
              <Text style={styles.noCameraText}>Camera access is needed to scan QR codes.</Text>
              {permission ? (
                <TouchableOpacity style={styles.allowBtn} onPress={requestPermission}>
                  <Text style={styles.allowBtnText}>Allow camera</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.noCameraSub}>You can still use "+ Add item" below.</Text>
            </View>
          )}
          <View
            pointerEvents="none"
            style={[
              styles.hint,
              messageType === 'ok' && styles.hintOk,
              messageType === 'error' && styles.hintError,
            ]}
          >
            <Text style={styles.hintText} numberOfLines={1}>
              {message}
            </Text>
          </View>
        </View>
 
        {/* Total card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            TOTAL ({units} item{units === 1 ? '' : 's'})
          </Text>
          <Text style={styles.totalValue}>{formatMWK(total)}</Text>
        </View>
 
        {/* Items */}
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 8 }}
          data={items}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>No items added yet, Scan QR code to Add.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.rowBottom}>
                <Text style={styles.unitPrice}>{formatMWK(item.price)} each</Text>
 
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => changeQty(item.id, -1)}>
                    <Text style={styles.stepText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    key={item.id + '-' + qtyOf(item)}
                    style={styles.qtyInput}
                    defaultValue={String(qtyOf(item))}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                    onEndEditing={(e) => setQty(item.id, e.nativeEvent.text)}
                  />
                  <TouchableOpacity style={styles.stepBtn} onPress={() => changeQty(item.id, 1)}>
                    <Text style={styles.stepText}>+</Text>
                  </TouchableOpacity>
                </View>
 
                <Text style={styles.rowPrice}>{formatMWK(lineTotal(item))}</Text>
              </View>
            </View>
          )}
        />
 
        {/* Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={clearAll}>
            <Text style={styles.secondaryBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { flex: 1.3 }]} onPress={openManual}>
            <Text style={styles.secondaryBtnText}>+ Add item</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 1.6 }, items.length === 0 && styles.btnDisabled]}
            onPress={saveList}
          >
            <Text style={styles.primaryBtnText}>Save list</Text>
          </TouchableOpacity>
        </View>
 
        {/* Manual entry (no QR code) */}
        <Modal
          visible={manualOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setManualOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Add item manually</Text>
 
              <Text style={styles.fieldLabel}>Item name</Text>
              <TextInput
                style={styles.field}
                value={mName}
                onChangeText={setMName}
                placeholder="e.g. Sugar 1kg"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
 
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.fieldLabel}>Price (MWK)</Text>
                  <TextInput
                    style={styles.field}
                    value={mPrice}
                    onChangeText={setMPrice}
                    placeholder="e.g. 2300"
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Quantity</Text>
                  <TextInput
                    style={styles.field}
                    value={mQty}
                    onChangeText={setMQty}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                  />
                </View>
              </View>
 
              <Text style={styles.sheetTotal}>
                Line total:{' '}
                {formatMWK(
                  (parseFloat(mPrice.replace(/,/g, '')) || 0) *
                    (parseInt(mQty.replace(/[^0-9]/g, ''), 10) || 1)
                )}
              </Text>
 
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { flex: 1 }]}
                  onPress={() => setManualOpen(false)}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1.5 }]} onPress={submitManual}>
                  <Text style={styles.primaryBtnText}>Add to list</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }
 
  function renderHistory() {
    return (
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12 }}
        data={history}
        keyExtractor={(h) => h.id}
        ListEmptyComponent={<Text style={styles.empty}>No saved lists yet.</Text>}
        renderItem={({ item: h }) => {
          const open = expandedId === h.id;
          const n = countUnits(h.items);
          return (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => setExpandedId(open ? null : h.id)}>
                <Text style={styles.cardDate}>{formatDate(h.date)}</Text>
                <View style={styles.cardRow}>
                  <Text style={styles.cardMeta}>
                    {n} item{n === 1 ? '' : 's'}
                  </Text>
                  <Text style={styles.cardTotal}>{formatMWK(h.total)}</Text>
                </View>
              </TouchableOpacity>
              {open && (
                <View style={{ marginTop: 8 }}>
                  {h.items.map((i) => (
                    <View key={i.id} style={styles.detailRow}>
                      <Text style={styles.detailName} numberOfLines={1}>
                        {i.name}
                        {qtyOf(i) > 1 ? `  × ${qtyOf(i)}` : ''}
                      </Text>
                      <Text style={styles.detailPrice}>{formatMWK(lineTotal(i))}</Text>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => deleteHistory(h.id)}>
                    <Text style={styles.deleteText}>Delete this list</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    );
  }
 
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK} />
      <View style={styles.header}>
        <Text style={styles.title}>Net-Pro Grocery Total</Text>
      </View>
      <View style={{ flex: 1 }}>{tab === 'scan' ? renderScan() : renderHistory()}</View>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'scan' && styles.tabActiveBox]}
          onPress={() => setTab('scan')}
        >
          <Text style={[styles.tabText, tab === 'scan' && styles.tabActive]}>Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'history' && styles.tabActiveBox]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabActive]}>
            History ({history.length})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
 
// ---------- styles ----------
 
const DARK = '#374151'; // main charcoal
const GRAY = '#9ca3af'; // scan corners (use '#d1d5db' if hard to see)
const OK = '#16a34a';
const ERR = '#dc2626';
 
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingTop: StatusBar.currentHeight || 0,
    // on a laptop browser keep the app phone-shaped and centred
    ...(Platform.OS === 'web' ? { width: '100%', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' } : {}),
  },
  header: { backgroundColor: DARK, paddingVertical: 14, alignItems: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText: { fontSize: 16, textAlign: 'center', marginBottom: 16, color: '#111827' },
 
  // camera + frame  (change frame width/height to resize the scan box)
  cameraWrap: {
    height: 260,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: 'hidden',
  },
  frame: { width: 150, height: 150 },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: GRAY },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
 
  // shown instead of the camera when camera access is off
  noCamera: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 30 },
  noCameraText: { color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 12 },
  allowBtn: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 10 },
  allowBtnText: { color: DARK, fontSize: 15, fontWeight: '700' },
  noCameraSub: { color: '#9ca3af', fontSize: 13, marginTop: 12, textAlign: 'center' },
 
  // hint label on top of the camera
  hint: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(17,24,39,0.65)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  hintOk: { backgroundColor: OK },
  hintError: { backgroundColor: ERR },
  hintText: { color: '#fff', fontSize: 14, fontWeight: '600' },
 
  // total card
  totalCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  totalLabel: { fontSize: 12, color: '#6b7280', letterSpacing: 1 },
  totalValue: { fontSize: 38, fontWeight: '800', color: DARK, marginTop: 2 },
 
  // item rows (name on top, price / quantity / line total underneath)
  row: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 8,
    paddingLeft: 14,
    paddingBottom: 10,
    borderRadius: 10,
    elevation: 1,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowName: { flex: 1, fontSize: 16, fontWeight: '600', paddingVertical: 10, color: '#111827' },
  removeBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  removeText: { color: ERR, fontSize: 16 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', paddingRight: 14 },
  unitPrice: { flex: 1, fontSize: 13, color: '#6b7280' },
  stepper: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, fontWeight: '700', color: DARK, lineHeight: 22 },
  qtyInput: {
    width: 52,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    paddingVertical: 0,
  },
  rowPrice: { fontSize: 16, fontWeight: '800', color: DARK, minWidth: 90, textAlign: 'right' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 28, fontSize: 15, paddingHorizontal: 20 },
 
  // buttons
  actions: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: '#fff' },
  primaryBtn: {
    backgroundColor: DARK,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
  secondaryBtn: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#111827', fontSize: 16, fontWeight: '600' },
 
  // manual entry sheet
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    padding: 18,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: DARK, marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: '#6b7280', marginBottom: 4, marginTop: 6 },
  field: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  sheetTotal: { fontSize: 15, fontWeight: '700', color: DARK, marginTop: 12 },
 
  // history
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
  },
  cardDate: { fontSize: 14, color: '#6b7280' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  cardMeta: { fontSize: 15, color: '#374151' },
  cardTotal: { fontSize: 18, fontWeight: '700', color: DARK },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailName: { flex: 1, fontSize: 15, color: '#111827' },
  detailPrice: { fontSize: 15, fontWeight: '600', color: DARK },
  deleteText: { color: ERR, marginTop: 10, fontWeight: '600' },
 
  // tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderTopWidth: 3, borderTopColor: 'transparent' },
  tabActiveBox: { borderTopColor: DARK },
  tabText: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },
  tabActive: { color: DARK, fontWeight: '800' },
});