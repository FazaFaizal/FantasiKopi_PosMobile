import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Alert,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Database } from '../../types/database';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge, statusTone } from '../../components/Badge';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAdminSidebar } from '../../components/SidebarDrawer';
import { LoadingState, EmptyState, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../hooks/useResponsive';

type Employee = Database['public']['Tables']['employees']['Row'];

export default function EmployeeScreen() {
  const { openSidebar } = useAdminSidebar();
  const { isTablet, columns } = useResponsive();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Semua' | 'Aktif' | 'Nonaktif'>('Semua');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [nameError, setNameError] = useState('');

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setEmployees(data || []);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Gagal memuat data karyawan dari server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const openAddModal = () => {
    setEditingEmployee(null);
    setName('');
    setPhone('');
    setEmail('');
    setPosition('');
    setStatus('Aktif');
    setNameError('');
    setModalVisible(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setName(emp.name);
    setPhone(emp.phone || '');
    setEmail(emp.email || '');
    setPosition(emp.position || '');
    setStatus(emp.status);
    setNameError('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    setNameError('');
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError('Nama lengkap karyawan wajib diisi');
      return;
    }

    setSubmitting(true);
    try {
      if (editingEmployee) {
        // UPDATE
        const { error } = await supabase
          .from('employees')
          .update({
            name: cleanName,
            phone: phone.trim() || null,
            email: email.trim() || null,
            position: position.trim() || null,
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEmployee.id);

        if (error) throw error;
        Alert.alert('Sukses', 'Data karyawan berhasil diperbarui.');
      } else {
        // INSERT
        const { error } = await supabase
          .from('employees')
          .insert({
            name: cleanName,
            phone: phone.trim() || null,
            email: email.trim() || null,
            position: position.trim() || null,
            status: status,
          });

        if (error) throw error;
        Alert.alert('Sukses', 'Karyawan baru berhasil ditambahkan.');
      }

      setModalVisible(false);
      fetchEmployees();
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan saat menyimpan data.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (emp: Employee) => {
    const isActivating = emp.status === 'Nonaktif';
    const newStatus = isActivating ? 'Aktif' : 'Nonaktif';

    Alert.alert(
      isActivating ? 'Aktifkan Kembali Karyawan' : 'Nonaktifkan Karyawan',
      isActivating
        ? `Aktifkan kembali "${emp.name}"? Staf akan kembali dapat bertugas dan dihubungkan ke akun login.`
        : `Nonaktifkan "${emp.name}"? Sesuai aturan sistem, akun login yang terhubung ke karyawan ini juga akan otomatis dinonaktifkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: isActivating ? 'Aktifkan' : 'Nonaktifkan',
          style: isActivating ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('employees')
                .update({
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', emp.id);

              if (error) throw error;
              fetchEmployees();
            } catch (err: any) {
              Alert.alert('Gagal Mengubah Status', err?.message || 'Terjadi kesalahan.');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (emp: Employee) => {
    Alert.alert(
      'Konfirmasi Hapus Data',
      `Hapus data karyawan "${emp.name}"? Relasi akun pengguna terkait akan dilepaskan.\n\nCatatan: Sesuai aturan PRD, karyawan operasional disarankan untuk dinonaktifkan daripada dihapus permanen.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus Permanen',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('employees')
                .delete()
                .eq('id', emp.id);

              if (error) throw error;
              Alert.alert('Sukses', 'Data karyawan telah dihapus.');
              fetchEmployees();
            } catch (err: any) {
              Alert.alert('Gagal Menghapus', err?.message || 'Tidak dapat menghapus data karyawan.');
            }
          },
        },
      ]
    );
  };

  const filteredEmployees = employees.filter((e) => {
    if (statusFilter !== 'Semua' && e.status !== statusFilter) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      (e.position && e.position.toLowerCase().includes(q)) ||
      (e.phone && e.phone.includes(q))
    );
  });

  const renderItem = ({ item }: { item: Employee }) => {
    const initial = item.name.charAt(0).toUpperCase();
    const isAktif = item.status === 'Aktif';

    return (
      <View
        className="bg-surface rounded-card p-4 mb-3.5 border border-line shadow-sm"
        style={columns > 1 ? { flex: 1 } : undefined}
      >
        <View className="flex-row items-center mb-3">
          <View className="w-12 h-12 rounded-chip bg-primary/10 items-center justify-center mr-3 border border-primary/20">
            <Text className="font-heading text-primary text-xl">{initial}</Text>
          </View>
          <View className="flex-1 mr-2">
            <Text className="font-heading-semibold text-text text-base" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="font-body text-muted text-xs">
              {item.position || 'Staf Kedai'}
            </Text>
          </View>
          <Badge label={item.status} tone={statusTone(item.status)} />
        </View>

        {/* Contact details */}
        <View className="bg-background rounded-chip p-3 mb-3 border border-line flex-row justify-between">
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="call-outline" size={14} color="#6B7280" />
            <Text className="font-body text-text text-xs ml-1.5" numberOfLines={1}>
              {item.phone || '-'}
            </Text>
          </View>
          <View className="flex-row items-center flex-1">
            <Ionicons name="mail-outline" size={14} color="#6B7280" />
            <Text className="font-body text-text text-xs ml-1.5" numberOfLines={1}>
              {item.email || '-'}
            </Text>
          </View>
        </View>

        {/* Action Row */}
        <View className="flex-row justify-end gap-2 pt-2.5 border-t border-line items-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isAktif ? `Nonaktifkan ${item.name}` : `Aktifkan ${item.name}`}
            onPress={() => handleToggleStatus(item)}
            className={`min-h-11 px-3 py-2 rounded-button border border-line flex-row items-center ${
              isAktif ? 'bg-amber-500/10' : 'bg-success-soft'
            }`}
          >
            <Ionicons
              name={isAktif ? 'pause-circle-outline' : 'checkmark-circle-outline'}
              size={15}
              color={isAktif ? '#B45309' : '#166534'}
            />
            <Text
              className={`font-body-medium text-xs ml-1.5 ${
                isAktif ? 'text-amber-800' : 'text-success'
              }`}
            >
              {isAktif ? 'Nonaktifkan' : 'Aktifkan'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Edit data ${item.name}`}
            onPress={() => openEditModal(item)}
            className="min-h-11 px-3.5 py-2 rounded-button bg-background border border-line flex-row items-center"
          >
            <Ionicons name="create-outline" size={15} color="#1F2937" />
            <Text className="font-body-medium text-text text-xs ml-1.5">Edit Data</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Hapus karyawan ${item.name}`}
            onPress={() => handleDelete(item)}
            className="min-h-11 px-2.5 py-2 rounded-button bg-danger-soft border border-line flex-row items-center"
          >
            <Ionicons name="trash-outline" size={15} color="#991B1B" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Data Karyawan"
        subtitle="Daftar Staf dan Tenaga Kerja Fantasi Coffee"
        onOpenSidebar={openSidebar}
      />

      <View
        className="flex-1 px-5 pt-4"
        style={isTablet ? { maxWidth: 1200, width: '100%', alignSelf: 'center' } : undefined}
      >
        {/* Search & Add Action Header */}
        <View className="flex-row gap-2 mb-3 items-center">
          <View className="flex-1 min-h-12 bg-surface rounded-input px-3.5 border border-line flex-row items-center">
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              placeholder="Cari nama, jabatan, nomor..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-body text-sm text-text ml-2"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                className="p-1"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={16} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          <Button
            title="Tambah"
            variant="primary"
            className="w-auto px-4 min-h-12"
            icon={<Ionicons name="add" size={18} color="#FFFFFF" />}
            onPress={openAddModal}
          />
        </View>

        {/* Status Filter Tabs */}
        <View className="flex-row gap-2 mb-4">
          {(['Semua', 'Aktif', 'Nonaktif'] as const).map((st) => {
            const active = statusFilter === st;
            return (
              <TouchableOpacity
                key={st}
                accessibilityRole="button"
                onPress={() => setStatusFilter(st)}
                className={`flex-1 min-h-11 rounded-chip items-center justify-center border ${
                  active ? 'bg-primary border-primary' : 'bg-surface border-line'
                }`}
              >
                <Text className={`font-body-medium text-xs ${active ? 'text-white' : 'text-text'}`}>
                  {st}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content list with complete states */}
        {loading ? (
          <LoadingState label="Memuat data karyawan..." />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchEmployees} />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'Karyawan Tidak Ditemukan' : 'Belum Ada Karyawan'}
            iconName="people-outline"
            description={
              searchQuery
                ? 'Tidak ada data staf yang cocok dengan kata kunci pencarian.'
                : 'Mulai dengan menambahkan data staf pertama untuk operasional kedai.'
            }
            actionLabel={searchQuery ? undefined : 'Tambah Karyawan Baru'}
            onAction={searchQuery ? undefined : openAddModal}
          />
        ) : (
          <FlatList
            key={columns}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
            data={filteredEmployees}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
            refreshing={loading}
            onRefresh={fetchEmployees}
          />
        )}
      </View>

      {/* Modal Form Tambah / Edit */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View className={`flex-1 bg-black/50 ${isTablet ? 'justify-center items-center px-6' : 'justify-end'}`}>
            <TouchableOpacity
              accessibilityLabel="Tutup dialog"
              className="flex-1"
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                setModalVisible(false);
              }}
            />
            <View
              className={`bg-surface ${
                isTablet
                  ? 'rounded-card p-6 shadow-xl border border-line'
                  : 'rounded-t-card p-6 border-t border-line'
              }`}
              style={isTablet ? { width: '100%', maxWidth: 580, maxHeight: '85%' } : { maxHeight: '85%' }}
            >
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={true}
                contentContainerStyle={{ paddingBottom: 48 }}
              >
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="font-heading text-text text-xl">
                    {editingEmployee ? 'Edit Data Karyawan' : 'Tambah Karyawan Baru'}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Tutup dialog"
                    onPress={() => setModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    className="min-h-11 min-w-11 items-center justify-center -mr-2"
                  >
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Input
                  label="Nama Lengkap Karyawan *"
                  placeholder="Contoh: Budi Santoso"
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    if (nameError) setNameError('');
                  }}
                  error={nameError}
                  leftIcon={<Ionicons name="person-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label="Jabatan / Posisi Kerja"
                  placeholder="Contoh: Barista, Kasir, Kitchen, Manager"
                  value={position}
                  onChangeText={setPosition}
                  leftIcon={<Ionicons name="briefcase-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label="Nomor Telepon"
                  placeholder="Contoh: 081234567890"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  leftIcon={<Ionicons name="call-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label="Alamat Email Kontak"
                  placeholder="nama@email.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon={<Ionicons name="mail-outline" size={18} color="#6B7280" />}
                />

                <ChoiceGroup
                  label="Status Keaktifan Karyawan"
                  value={status}
                  onChange={(val) => setStatus(val as 'Aktif' | 'Nonaktif')}
                  options={[
                    { value: 'Aktif', label: 'Aktif Bekerja' },
                    { value: 'Nonaktif', label: 'Nonaktif' },
                  ]}
                />

                <View className="bg-background rounded-chip p-3 mb-4 border border-line">
                  <Text className="font-body text-muted text-xs leading-4">
                    Perhatian: Menetapkan status Nonaktif akan menonaktifkan akun login pengguna yang terhubung ke karyawan ini.
                  </Text>
                </View>

                <View className="flex-row gap-3 mt-2 mb-2">
                  <Button
                    title="Batal"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setModalVisible(false)}
                  />
                  <Button
                    title={editingEmployee ? 'Simpan' : 'Tambah'}
                    variant="primary"
                    className="flex-1"
                    isLoading={submitting}
                    icon={<Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                    onPress={handleSave}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
