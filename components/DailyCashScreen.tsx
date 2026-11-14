import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ScreenHeader } from './ScreenHeader';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';
import { LoadingState, ErrorState } from './States';
import { formatRupiah } from '../lib/formatters';
import { useResponsive } from '../hooks/useResponsive';
import {
  CashRecapExpense,
  CashRecapOrder,
  calculateCashDifference,
  calculateDailyCashRecap,
  validateCashExpense,
} from '../lib/cash-logic';
import { getBusinessDateString, getBusinessDayStartISO } from '../lib/timezone';
import {
  canCloseShift,
  getSuggestedOpeningCash,
  validateCloseShift,
  validateOpenShift,
} from '../lib/shift-logic';
import { EXPENSE_CATEGORIES, ExpenseCategory, getExpenseCategoryMeta } from '../lib/expense-logic';

interface TodayExpense extends CashRecapExpense {
  id: string;
  description: string;
  category: ExpenseCategory;
  stock_movement_id: string | null;
  created_at: string;
}

/** Hasil RPC get_shift_summary. */
interface ShiftSummary {
  id: string;
  status: 'Open' | 'Closed';
  opened_by: string | null;
  opened_by_name: string | null;
  opened_at: string;
  opening_cash: number;
  opening_note: string | null;
  cash_in: number;
  cash_refunds: number;
  qris_in: number;
  debit_in?: number;
  cash_expenses: number;
  paid_order_count: number;
  expected_cash: number;
}

interface ClosedShiftRow {
  id: string;
  opened_by_name: string | null;
  opened_at: string;
  closed_by_name: string | null;
  closed_at: string;
  opening_cash: number;
  expected_cash: number;
  counted_cash: number;
  cash_withdrawn: number;
  difference: number;
  opening_note: string | null;
  closing_note: string | null;
}

interface DailyCashScreenProps {
  onOpenSidebar: () => void;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Angka → teks input tanpa simbol (contoh 1200000 → "1.200.000"). */
const toAmountText = (n: number) => new Intl.NumberFormat('id-ID').format(n);

/**
 * Kas Harian & Sif Kasir (Kasir & Admin):
 * buka/tutup sif, kas seharusnya di laci untuk sif aktif, ringkasan penjualan & pengeluaran hari ini.
 */
export function DailyCashScreen({ onOpenSidebar }: DailyCashScreenProps) {
  const { user } = useAuth();
  const { isTablet } = useResponsive();
  const isAdmin = user?.role === 'Admin';

  const [today, setToday] = useState(getBusinessDateString());
  const [orders, setOrders] = useState<CashRecapOrder[]>([]);
  const [expenses, setExpenses] = useState<TodayExpense[]>([]);
  const [shift, setShift] = useState<ShiftSummary | null>(null);
  const [suggestedOpening, setSuggestedOpening] = useState<number | null>(null);
  const [closedShifts, setClosedShifts] = useState<ClosedShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Modal buka sif
  const [openModal, setOpenModal] = useState(false);
  const [openingText, setOpeningText] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [openErrors, setOpenErrors] = useState<Record<string, string>>({});

  // Modal tutup sif
  const [closeModal, setCloseModal] = useState(false);
  const [countedText, setCountedText] = useState('');
  const [withdrawnText, setWithdrawnText] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [closeErrors, setCloseErrors] = useState<Record<string, string>>({});

  // Modal pengeluaran
  const [expenseModal, setExpenseModal] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Operational');
  const [amountText, setAmountText] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const businessToday = getBusinessDateString();
    setToday(businessToday);
    try {
      setErrorMessage('');
      const [ordersRes, expensesRes, shiftRes, closedRes] = await Promise.all([
        // Penjualan diakui saat dibayar (paid_at) — termasuk order kemarin yang baru dibayar hari ini;
        // order lama tanpa paid_at & order yang menunggu bayar memakai created_at.
        supabase
          .from('orders')
          .select('payment_method, payment_status, order_status, total_amount, created_at, paid_at')
          .or(
            `paid_at.gte.${getBusinessDayStartISO(businessToday)},and(paid_at.is.null,created_at.gte.${getBusinessDayStartISO(businessToday)})`
          ),
        supabase
          .from('expenses')
          .select('id, description, category, amount, expense_date, paid_from_cash, stock_movement_id, created_at')
          .eq('expense_date', businessToday)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_shift_summary'),
        supabase
          .from('cash_shifts')
          .select(
            'id, opened_by_name, opened_at, closed_by_name, closed_at, opening_cash, expected_cash, counted_cash, cash_withdrawn, difference, opening_note, closing_note'
          )
          .eq('status', 'Closed')
          .order('closed_at', { ascending: false })
          .limit(isAdmin ? 10 : 1),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (shiftRes.error) throw shiftRes.error;
      if (closedRes.error) throw closedRes.error;

      const closed = (closedRes.data as ClosedShiftRow[]) || [];
      setOrders((ordersRes.data as CashRecapOrder[]) || []);
      setExpenses((expensesRes.data as TodayExpense[]) || []);
      setShift((shiftRes.data as ShiftSummary | null) ?? null);
      setClosedShifts(closed);
      setSuggestedOpening(getSuggestedOpeningCash(closed[0] ?? null));
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memuat data kas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const recap = calculateDailyCashRecap(orders, expenses, today);

  // ---------------------------------------------------------------------------
  // Buka sif
  // ---------------------------------------------------------------------------
  const startOpenShift = () => {
    setOpeningText(suggestedOpening !== null ? toAmountText(suggestedOpening) : '');
    setOpeningNote('');
    setOpenErrors({});
    setOpenModal(true);
  };

  const handleOpenShift = async () => {
    const result = validateOpenShift({ openingText, noteText: openingNote, suggested: suggestedOpening });
    if (!result.isValid || !result.params) {
      setOpenErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('open_cash_shift', result.params);
      if (error) throw error;
      setOpenModal(false);
      Alert.alert('Sif Dibuka', `Modal awal ${formatRupiah(result.params.p_opening_cash)}. POS siap dipakai.`);
      fetchData();
    } catch (err: any) {
      Alert.alert('Gagal Membuka Sif', err?.message || 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Tutup sif
  // ---------------------------------------------------------------------------
  const startCloseShift = () => {
    setCountedText('');
    setWithdrawnText('');
    setClosingNote('');
    setCloseErrors({});
    setCloseModal(true);
  };

  const handleCloseShift = async () => {
    if (!shift) return;
    const result = validateCloseShift({
      countedText,
      withdrawnText,
      noteText: closingNote,
      expectedCash: Number(shift.expected_cash),
    });
    if (!result.isValid || !result.params) {
      setCloseErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('close_cash_shift', result.params);
      if (error) throw error;
      setCloseModal(false);
      const remaining = result.params.p_counted - result.params.p_withdrawn;
      Alert.alert(
        'Sif Ditutup',
        `Uang di laci ${formatRupiah(result.params.p_counted)}, disetor ${formatRupiah(result.params.p_withdrawn)}.\n` +
          `Sisa ${formatRupiah(remaining)} menjadi modal awal sif berikutnya.`
      );
      fetchData();
    } catch (err: any) {
      Alert.alert('Gagal Menutup Sif', err?.message || 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Pengeluaran harian
  // ---------------------------------------------------------------------------
  const startExpense = () => {
    if (!shift && !isAdmin) {
      Alert.alert('Sif Belum Dibuka', 'Buka sif terlebih dahulu sebelum mencatat pengeluaran dari kas.');
      return;
    }
    setDescription('');
    setCategory('Operational');
    setAmountText('');
    setFormErrors({});
    setExpenseModal(true);
  };

  const handleSaveExpense = async () => {
    if (!user?.id) return;
    const result = validateCashExpense({ description, category, amountText }, user.id);
    if (!result.isValid || !result.payload) {
      setFormErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('expenses').insert(result.payload);
      if (error) throw error;
      setExpenseModal(false);
      Alert.alert('Tersimpan', `Pengeluaran ${formatRupiah(result.payload.amount)} dicatat dari kas laci.`);
      fetchData();
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan saat menyimpan pengeluaran.');
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = new Date(`${today}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const closePreview = shift ? calculateCashDifference(Number(shift.expected_cash), countedText) : null;
  const openingPreview = openingText.trim() ? validateOpenShift({ openingText, noteText: 'x', suggested: null }).params : undefined;
  const openingDiffers =
    suggestedOpening !== null && openingPreview !== undefined && openingPreview.p_opening_cash !== suggestedOpening;
  const userCanClose = shift ? canCloseShift(shift, user ? { id: user.id, role: user.role } : null) : false;

  const diffText = (d: number) => (d === 0 ? 'Cocok ✓' : d > 0 ? `Lebih ${formatRupiah(d)}` : `Kurang ${formatRupiah(-d)}`);
  const diffClass = (d: number) => (d === 0 ? 'text-emerald-700' : d > 0 ? 'text-amber-700' : 'text-rose-700');

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Kas & Sif Kasir" subtitle={dateLabel} onOpenSidebar={onOpenSidebar} />

      {loading ? (
        <LoadingState label="Memuat kas & sif..." />
      ) : errorMessage ? (
        <ErrorState message={errorMessage} onRetry={fetchData} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          style={isTablet ? { maxWidth: 900, width: '100%', alignSelf: 'center' } : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchData();
              }}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* ================= SIF AKTIF ================= */}
          {shift ? (
            <View className="bg-primary rounded-card p-4 mb-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-body text-white/80 text-xs">Kas seharusnya di laci (sif aktif)</Text>
                <View className="bg-white/20 px-2 py-0.5 rounded-chip">
                  <Text className="font-heading-semibold text-white text-[10px]">SIF AKTIF</Text>
                </View>
              </View>
              <Text className="font-heading-bold text-white text-3xl mt-1">{formatRupiah(Number(shift.expected_cash))}</Text>
              <Text className="font-body text-white/80 text-[11px] mt-1">
                Dibuka {formatTime(shift.opened_at)} oleh {shift.opened_by_name || 'staf'}
              </Text>

              <View className="bg-white/10 rounded-card p-3 mt-3">
                {[
                  ['Modal awal', Number(shift.opening_cash), ''],
                  ['Tunai diterima', Number(shift.cash_in), '+'],
                  ['Refund tunai', Number(shift.cash_refunds), '−'],
                  ['Pengeluaran dari kas', Number(shift.cash_expenses), '−'],
                ].map(([label, value, sign]) => (
                  <View key={label as string} className="flex-row justify-between py-0.5">
                    <Text className="font-body text-white/90 text-xs">{label}</Text>
                    <Text className="font-body-medium text-white text-xs">
                      {sign} {formatRupiah(value as number)}
                    </Text>
                  </View>
                ))}
                <Text className="font-body text-white/70 text-[10px] mt-1">
                  Non-tunai sif ini: QRIS {formatRupiah(Number(shift.qris_in))} · Debit{' '}
                  {formatRupiah(Number(shift.debit_in ?? 0))} (tidak masuk laci) · {shift.paid_order_count} pembayaran
                </Text>
              </View>

              {userCanClose ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Tutup sif"
                  onPress={startCloseShift}
                  className="mt-3 bg-white rounded-button min-h-11 items-center justify-center flex-row"
                >
                  <Ionicons name="lock-closed-outline" size={16} color="#D1001F" />
                  <Text className="font-heading-semibold text-primary text-sm ml-1.5">Tutup Sif & Hitung Kas</Text>
                </TouchableOpacity>
              ) : (
                <Text className="font-body text-white/80 text-[11px] mt-3">
                  Sif ini hanya dapat ditutup oleh kasir yang membukanya atau Admin.
                </Text>
              )}
            </View>
          ) : (
            <View className="bg-surface border border-line rounded-card p-4 mb-3">
              <View className="flex-row items-center mb-1">
                <Ionicons name="lock-closed-outline" size={18} color="#D1001F" />
                <Text className="font-heading-semibold text-text text-base ml-2">Belum ada sif aktif</Text>
              </View>
              <Text className="font-body text-muted text-xs mb-3">
                POS terkunci sampai sif dibuka.
                {suggestedOpening !== null
                  ? ` Sisa kas sif sebelumnya: ${formatRupiah(suggestedOpening)}.`
                  : ' Ini sif pertama; masukkan modal awal di laci.'}
              </Text>
              <Button
                title="Buka Sif"
                onPress={startOpenShift}
                icon={<Ionicons name="lock-open-outline" size={16} color="#FFFFFF" />}
              />
            </View>
          )}

          {/* ================= RINGKASAN HARI INI ================= */}
          <Text className="font-heading-semibold text-text text-sm mb-2 mt-1">Ringkasan hari ini</Text>
          <View className="flex-row flex-wrap justify-between mb-1">
            {[
              { label: 'Penjualan Tunai', value: recap.cashSales, note: `${recap.cashOrderCount} order lunas`, icon: 'cash-outline' as const },
              {
                label: 'Non-tunai',
                value: recap.qrisSales + recap.debitSales,
                note: `QRIS ${formatRupiah(recap.qrisSales)} · Debit ${formatRupiah(recap.debitSales)}`,
                icon: 'card-outline' as const,
              },
              { label: 'Pengeluaran dari Kas', value: recap.cashExpenses, note: 'Mengurangi uang laci', icon: 'wallet-outline' as const },
              { label: 'Pengeluaran Lain', value: recap.otherExpenses, note: 'Transfer / sumber lain', icon: 'card-outline' as const },
            ].map((c) => (
              <View key={c.label} className="bg-surface border border-line rounded-card p-3 mb-2.5" style={{ width: '48.5%' }}>
                <View className="flex-row items-center mb-1">
                  <Ionicons name={c.icon} size={14} color="#6B7280" />
                  <Text className="font-body text-muted text-[11px] ml-1">{c.label}</Text>
                </View>
                <Text className="font-heading-semibold text-text text-base">{formatRupiah(c.value)}</Text>
                <Text className="font-body text-muted text-[10px] mt-0.5">{c.note}</Text>
              </View>
            ))}
          </View>

          {recap.awaitingPaymentCount > 0 && (
            <View className="flex-row items-center bg-amber-50 border border-amber-200 rounded-card p-3 mb-3">
              <Ionicons name="time-outline" size={16} color="#B45309" />
              <Text className="font-body text-amber-800 text-xs ml-2 flex-1">
                {recap.awaitingPaymentCount} pesanan hari ini belum dibayar dan belum masuk kas.
              </Text>
            </View>
          )}

          {/* ================= PENGELUARAN ================= */}
          <View className="flex-row items-center justify-between mb-2 mt-1">
            <Text className="font-heading-semibold text-text text-sm">Pengeluaran hari ini</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Catat pengeluaran harian"
              onPress={startExpense}
              className={`flex-row items-center px-3 py-2 rounded-chip min-h-11 ${shift || isAdmin ? 'bg-primary' : 'bg-slate-300'}`}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text className="font-heading-semibold text-white text-xs ml-1">Catat Pengeluaran</Text>
            </TouchableOpacity>
          </View>

          {expenses.length === 0 ? (
            <View className="bg-surface border border-line rounded-card p-4 items-center mb-3">
              <Ionicons name="receipt-outline" size={22} color="#9CA3AF" />
              <Text className="font-body text-muted text-xs mt-1">Belum ada pengeluaran hari ini.</Text>
            </View>
          ) : (
            expenses.map((exp) => {
              const meta = getExpenseCategoryMeta(exp.category);
              return (
                <View key={exp.id} className="bg-surface border border-line rounded-card p-3 mb-2 flex-row items-center">
                  <View className="flex-1 mr-2">
                    <Text className="font-body-medium text-text text-sm" numberOfLines={2}>
                      {exp.description}
                    </Text>
                    <View className="flex-row items-center mt-1 flex-wrap gap-1.5">
                      <Badge label={meta.label} tone={meta.tone} />
                      <Text className="font-body text-muted text-[10px]">
                        {exp.paid_from_cash ? 'Dari kas laci' : 'Sumber lain'}
                        {exp.stock_movement_id ? ' · dari Stock In' : ''}
                      </Text>
                    </View>
                  </View>
                  <Text className="font-heading-semibold text-danger text-sm">- {formatRupiah(exp.amount)}</Text>
                </View>
              );
            })
          )}

          {/* ================= RIWAYAT SIF (ADMIN) ================= */}
          {isAdmin && (
            <>
              <Text className="font-heading-semibold text-text text-sm mb-2 mt-3">Riwayat sif terakhir</Text>
              {closedShifts.length === 0 ? (
                <Text className="font-body text-muted text-xs">Belum ada sif yang ditutup.</Text>
              ) : (
                closedShifts.map((s) => {
                  const diff = Number(s.difference);
                  return (
                    <View key={s.id} className="bg-surface border border-line rounded-card p-3 mb-2">
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 mr-2">
                          <Text className="font-body-medium text-text text-xs">
                            {formatTime(s.opened_at)} – {formatTime(s.closed_at)}
                          </Text>
                          <Text className="font-body text-muted text-[11px]">
                            Dibuka {s.opened_by_name || '-'} · ditutup {s.closed_by_name || '-'}
                          </Text>
                        </View>
                        <Text className={`font-heading-semibold text-xs ${diffClass(diff)}`}>{diffText(diff)}</Text>
                      </View>
                      <Text className="font-body text-muted text-[11px] mt-1">
                        Modal {formatRupiah(Number(s.opening_cash))} · seharusnya {formatRupiah(Number(s.expected_cash))} · dihitung{' '}
                        {formatRupiah(Number(s.counted_cash))} · disetor {formatRupiah(Number(s.cash_withdrawn))}
                      </Text>
                      {s.opening_note ? (
                        <Text className="font-body text-muted text-[11px] italic mt-0.5">Catatan buka: {s.opening_note}</Text>
                      ) : null}
                      {s.closing_note ? (
                        <Text className="font-body text-muted text-[11px] italic mt-0.5">Catatan tutup: {s.closing_note}</Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ================= MODAL BUKA SIF ================= */}
      <Modal visible={openModal} transparent animationType="slide" onRequestClose={() => setOpenModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-black/60 justify-end">
          <View className="bg-surface rounded-t-3xl p-5 border-t border-line" style={{ maxHeight: '88%' }}>
            <Text className="font-heading text-text text-lg">Buka Sif</Text>
            <Text className="font-body text-muted text-xs mb-4">
              Hitung uang di laci sebelum mulai melayani.
              {suggestedOpening !== null ? ` Sisa kas sif sebelumnya ${formatRupiah(suggestedOpening)}.` : ''}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" className="mb-4">
              <Input
                label="Modal awal di laci"
                placeholder="Contoh: 200.000"
                keyboardType="number-pad"
                value={openingText}
                onChangeText={(t) => {
                  setOpeningText(t);
                  setOpenErrors({});
                }}
                error={openErrors.opening}
                leftIcon={<Ionicons name="cash-outline" size={18} color="#6B7280" />}
              />
              {openingDiffers && (
                <Text className="font-body text-amber-700 text-xs -mt-2 mb-3">
                  Berbeda dari sisa kas sif sebelumnya. Isi catatan penyebabnya.
                </Text>
              )}
              <Input
                label={openingDiffers ? 'Catatan (wajib)' : 'Catatan (opsional)'}
                placeholder="Contoh: Uang kembalian ditukar ke bank"
                value={openingNote}
                onChangeText={(t) => {
                  setOpeningNote(t);
                  if (openErrors.note) setOpenErrors({});
                }}
                error={openErrors.note}
              />
            </ScrollView>
            <View className="flex-row gap-2 pt-2 border-t border-line">
              <Button title="Batal" variant="outline" className="flex-1" onPress={() => setOpenModal(false)} />
              <Button title="Buka Sif" variant="primary" className="flex-1" isLoading={saving} onPress={handleOpenShift} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= MODAL TUTUP SIF ================= */}
      <Modal visible={closeModal} transparent animationType="slide" onRequestClose={() => setCloseModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-black/60 justify-end">
          <View className="bg-surface rounded-t-3xl p-5 border-t border-line" style={{ maxHeight: '88%' }}>
            <Text className="font-heading text-text text-lg">Tutup Sif</Text>
            <Text className="font-body text-muted text-xs mb-4">
              Kas seharusnya di laci: {shift ? formatRupiah(Number(shift.expected_cash)) : '-'}. Hitung seluruh uang di laci
              (termasuk modal awal).
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" className="mb-4">
              <Input
                label="Uang fisik di laci"
                placeholder="Contoh: 1.200.000"
                keyboardType="number-pad"
                value={countedText}
                onChangeText={(t) => {
                  setCountedText(t);
                  setCloseErrors({});
                }}
                error={closeErrors.counted}
                leftIcon={<Ionicons name="calculator-outline" size={18} color="#6B7280" />}
              />
              {closePreview && (
                <Text className={`font-heading-semibold text-sm -mt-2 mb-3 ${diffClass(closePreview.difference)}`}>
                  {diffText(closePreview.difference)}
                </Text>
              )}
              <Input
                label="Disetor / diambil dari laci (opsional)"
                placeholder="Kosongkan jika uang tetap di laci untuk sif berikutnya"
                keyboardType="number-pad"
                value={withdrawnText}
                onChangeText={(t) => {
                  setWithdrawnText(t);
                  if (closeErrors.withdrawn) setCloseErrors({});
                }}
                error={closeErrors.withdrawn}
                leftIcon={<Ionicons name="arrow-up-circle-outline" size={18} color="#6B7280" />}
              />
              <Input
                label={closePreview && closePreview.difference !== 0 ? 'Catatan selisih (wajib)' : 'Catatan (opsional)'}
                placeholder="Contoh: Salah memberi kembalian"
                value={closingNote}
                onChangeText={(t) => {
                  setClosingNote(t);
                  if (closeErrors.note) setCloseErrors({});
                }}
                error={closeErrors.note}
              />
            </ScrollView>
            <View className="flex-row gap-2 pt-2 border-t border-line">
              <Button title="Batal" variant="outline" className="flex-1" onPress={() => setCloseModal(false)} />
              <Button title="Tutup Sif" variant="primary" className="flex-1" isLoading={saving} onPress={handleCloseShift} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= MODAL PENGELUARAN ================= */}
      <Modal visible={expenseModal} transparent animationType="slide" onRequestClose={() => setExpenseModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-black/60 justify-end">
          <View className="bg-surface rounded-t-3xl p-5 border-t border-line" style={{ maxHeight: '88%' }}>
            <View className="flex-row items-center justify-between pb-3 border-b border-line mb-4">
              <View className="flex-1 mr-2">
                <Text className="font-heading text-text text-lg">Catat Pengeluaran Harian</Text>
                <Text className="font-body text-muted text-xs">
                  Dibayar dari kas laci hari ini. Koreksi hanya dapat dilakukan Admin.
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Tutup"
                onPress={() => setExpenseModal(false)}
                className="w-11 h-11 rounded-full bg-background items-center justify-center border border-line"
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="mb-4">
              <Input
                label="Keperluan"
                placeholder="Contoh: Es batu 2 kantong, gas LPG, parkir"
                value={description}
                onChangeText={(t) => {
                  setDescription(t);
                  if (formErrors.description) setFormErrors((p) => ({ ...p, description: '' }));
                }}
                error={formErrors.description}
                leftIcon={<Ionicons name="receipt-outline" size={18} color="#6B7280" />}
              />

              <Text className="font-body-medium text-text text-sm mb-2">Kategori</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const selected = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setCategory(cat)}
                      className={`px-3 py-2.5 rounded-card border ${selected ? 'bg-primary/10 border-primary' : 'bg-background border-line'}`}
                      style={{ width: '48%' }}
                    >
                      <Text className={`font-heading-semibold text-xs ${selected ? 'text-primary' : 'text-text'}`}>
                        {getExpenseCategoryMeta(cat).label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Input
                label="Nominal"
                placeholder="Contoh: 15.000"
                keyboardType="number-pad"
                value={amountText}
                onChangeText={(t) => {
                  setAmountText(t);
                  if (formErrors.amount) setFormErrors((p) => ({ ...p, amount: '' }));
                }}
                error={formErrors.amount}
                leftIcon={<Ionicons name="cash-outline" size={18} color="#6B7280" />}
              />
            </ScrollView>

            <View className="flex-row gap-2 pt-2 border-t border-line">
              <Button title="Batal" variant="outline" className="flex-1" onPress={() => setExpenseModal(false)} />
              <Button title="Simpan" variant="primary" className="flex-1" isLoading={saving} onPress={handleSaveExpense} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
