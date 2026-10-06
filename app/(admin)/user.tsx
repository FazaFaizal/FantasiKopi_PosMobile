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

type User = Database['public']['Tables']['users']['Row'];
type Employee = Database['public']['Tables']['employees']['Row'];

interface UserWithEmployee extends User {
  employee?: {
    name: string;
    position: string | null;
  } | null;
}

export default function UserAccountScreen() {
  const { openSidebar } = useAdminSidebar();
  const { isTablet, columns } = useResponsive();
  const [users, setUsers] = useState<UserWithEmployee[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'Semua' | 'Admin' | 'Kasir' | 'Customer'>('Semua');

  // Modal Edit Role & Status
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithEmployee | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields Edit
  const [role, setRole] = useState<'Admin' | 'Kasir' | 'Customer'>('Customer');
  const [status, setStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  // Modal Tambah Akun Internal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'Admin' | 'Kasir'>('Kasir');
  const [newEmployeeId, setNewEmployeeId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newEmailError, setNewEmailError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      // 1. Fetch Users with linked Employee info
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          *,
          employee:employees (
            name,
            position
          )
        `)
        .order('created_at', { ascending: false });

      if (userError) throw userError;

      // 2. Fetch Employees for link picker
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true });

      if (empError) throw empError;

      setUsers(userData || []);
      setEmployees(empData || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memuat data akun dari server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openEditModal = (user: UserWithEmployee) => {
    setSelectedUser(user);
    setRole(user.role);
    setStatus(user.status);
    setEmployeeId(user.employee_id);
    setEditModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!selectedUser) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          role: role,
          status: status,
          employee_id: employeeId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      Alert.alert('Sukses', 'Pengaturan akun pengguna berhasil disimpan.');
      setEditModalVisible(false);
      fetchData();
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan saat memperbarui akun.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (user: UserWithEmployee) => {
    const isActivating = user.status === 'Nonaktif';
    const newStatus = isActivating ? 'Aktif' : 'Nonaktif';

    Alert.alert(
      isActivating ? 'Aktifkan Akun Pengguna' : 'Nonaktifkan Akun Pengguna',
      isActivating
        ? `Aktifkan kembali akun "${user.email}"? Pengguna akan dapat masuk kembali.`
        : `Nonaktifkan akun "${user.email}"? Pengguna tidak akan dapat mengakses sistem hingga diaktifkan kembali.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: isActivating ? 'Aktifkan' : 'Nonaktifkan',
          style: isActivating ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('users')
                .update({
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', user.id);

              if (error) throw error;
              fetchData();
            } catch (err: any) {
              Alert.alert('Gagal Mengubah Status', err?.message || 'Terjadi kesalahan.');
            }
          },
        },
      ]
    );
  };

  const handleCreateInternalUser = async () => {
    setNewEmailError('');
    setNewPasswordError('');
    const cleanEmail = newEmail.trim();
    if (!cleanEmail) {
      setNewEmailError('Alamat email wajib diisi');
      return;
    }
    if (!cleanEmail.includes('@')) {
      setNewEmailError('Format email tidak valid');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setNewPasswordError('Password minimal 6 karakter');
      return;
    }

    setCreatingUser(true);
    try {
      // Create user auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: newPassword,
      });

      if (authErr) throw authErr;

      if (authData.user) {
        // Update user row role & employee link
        const { error: updateErr } = await supabase
          .from('users')
          .update({
            role: newRole,
            employee_id: newEmployeeId,
            status: 'Aktif',
          })
          .eq('id', authData.user.id);

        if (updateErr) {
          console.warn('Auto profile update error:', updateErr);
        }
      }

      Alert.alert('Sukses', `Akun ${newRole} baru untuk "${cleanEmail}" berhasil dibuat.`);
      setAddModalVisible(false);
      setNewEmail('');
      setNewPassword('');
      setNewRole('Kasir');
      setNewEmployeeId(null);
      fetchData();
    } catch (err: any) {
      Alert.alert('Gagal Membuat Akun', err?.message || 'Terjadi kesalahan pendaftaran akun internal.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = (user: UserWithEmployee) => {
    Alert.alert(
      'Konfirmasi Hapus Akun',
      `Hapus akun "${user.email}" secara permanen? Pengguna tidak akan dapat masuk lagi ke aplikasi.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus Akun',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', user.id);

              if (error) throw error;

              Alert.alert('Sukses', 'Akun pengguna berhasil dihapus.');
              fetchData();
            } catch (err: any) {
              Alert.alert('Gagal Menghapus', err?.message || 'Tidak dapat menghapus akun pengguna.');
            }
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'Semua' && u.role !== roleFilter) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      (u.employee && u.employee.name.toLowerCase().includes(q))
    );
  });

  const getRoleIcon = (userRole: string) => {
    switch (userRole) {
      case 'Admin':
        return <Ionicons name="shield-checkmark" size={12} color="#D1001F" />;
      case 'Kasir':
        return <Ionicons name="storefront" size={12} color="#B45309" />;
      default:
        return <Ionicons name="person" size={12} color="#4B5563" />;
    }
  };

  const renderItem = ({ item }: { item: UserWithEmployee }) => {
    const isAktif = item.status === 'Aktif';

    return (
      <View
        className="bg-surface rounded-card p-4 mb-3.5 border border-line shadow-sm"
        style={columns > 1 ? { flex: 1 } : undefined}
      >
        <View className="flex-row items-center mb-2.5">
          <View
            className={`w-11 h-11 rounded-chip items-center justify-center mr-3 border ${
              item.role === 'Admin'
                ? 'bg-primary/10 border-primary/20'
                : item.role === 'Kasir'
                ? 'bg-amber-500/15 border-amber-500/30'
                : 'bg-surface border-line'
            }`}
          >
            <Ionicons
              name={item.role === 'Admin' ? 'shield-checkmark' : item.role === 'Kasir' ? 'storefront' : 'person'}
              size={20}
              color={item.role === 'Admin' ? '#D1001F' : item.role === 'Kasir' ? '#B45309' : '#4B5563'}
            />
          </View>
          <View className="flex-1 mr-2">
            <Text className="font-heading-semibold text-text text-base" numberOfLines={1}>
              {item.email}
            </Text>
            <View className="flex-row gap-1.5 mt-1">
              <Badge
                label={item.role}
                tone={item.role === 'Admin' ? 'accent' : item.role === 'Kasir' ? 'warning' : 'neutral'}
                icon={getRoleIcon(item.role)}
              />
              <Badge label={item.status} tone={statusTone(item.status)} />
            </View>
          </View>
        </View>

        {/* Employee relation preview */}
        <View className="bg-background rounded-chip p-2.5 mb-3 border border-line flex-row items-center">
          <Ionicons name="link-outline" size={14} color="#6B7280" />
          <Text className="font-body text-muted text-xs ml-1.5 flex-1" numberOfLines={1}>
            Relasi Staf:{' '}
            <Text className="font-body-medium text-text">
              {item.employee
                ? `${item.employee.name} (${item.employee.position || 'Staf'})`
                : 'Akun Mandiri (Customer)'}
            </Text>
          </Text>
        </View>

        {/* Actions */}
        <View className="flex-row justify-end gap-2 pt-2.5 border-t border-line items-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isAktif ? `Nonaktifkan akun ${item.email}` : `Aktifkan akun ${item.email}`}
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
            accessibilityLabel={`Atur role dan status untuk ${item.email}`}
            onPress={() => openEditModal(item)}
            className="min-h-11 px-3.5 py-2 rounded-button bg-background border border-line flex-row items-center"
          >
            <Ionicons name="settings-outline" size={15} color="#1F2937" />
            <Text className="font-body-medium text-text text-xs ml-1.5">Hak Akses</Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Hapus akun ${item.email}`}
            onPress={() => handleDeleteUser(item)}
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
        title="Akun Pengguna"
        subtitle="Kelola Role Akses dan Relasi Staf"
        onOpenSidebar={openSidebar}
      />

      <View
        className="flex-1 px-5 pt-4"
        style={isTablet ? { maxWidth: 1200, width: '100%', alignSelf: 'center' } : undefined}
      >
        {/* Search bar & Add Internal User */}
        <View className="flex-row gap-2 mb-3 items-center">
          <View className="flex-1 min-h-12 bg-surface rounded-input px-3.5 border border-line flex-row items-center">
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              placeholder="Cari email atau nama staf..."
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
            icon={<Ionicons name="person-add" size={16} color="#FFFFFF" />}
            onPress={() => {
              setNewEmail('');
              setNewPassword('');
              setNewRole('Kasir');
              setNewEmployeeId(null);
              setNewEmailError('');
              setNewPasswordError('');
              setAddModalVisible(true);
            }}
          />
        </View>

        {/* Role Tabs */}
        <View className="flex-row gap-2 mb-4">
          {(['Semua', 'Admin', 'Kasir', 'Customer'] as const).map((r) => {
            const active = roleFilter === r;
            return (
              <TouchableOpacity
                key={r}
                accessibilityRole="button"
                onPress={() => setRoleFilter(r)}
                className={`flex-1 min-h-11 rounded-chip items-center justify-center border ${
                  active ? 'bg-primary border-primary' : 'bg-surface border-line'
                }`}
              >
                <Text className={`font-body-medium text-xs ${active ? 'text-white' : 'text-text'}`}>
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content list with states */}
        {loading ? (
          <LoadingState label="Memuat data akun pengguna..." />
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchData} />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="Akun Tidak Ditemukan"
            iconName="person-outline"
            description="Tidak ada akun pengguna yang sesuai dengan filter atau pencarian saat ini."
          />
        ) : (
          <FlatList
            key={columns}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110, flexGrow: 1 }}
            refreshing={loading}
            onRefresh={fetchData}
          />
        )}
      </View>

      {/* Modal Kelola Role & Akses */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
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
                setEditModalVisible(false);
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
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="font-heading text-text text-xl">Kelola Hak Akses</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Tutup dialog"
                    onPress={() => setEditModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    className="min-h-11 min-w-11 items-center justify-center -mr-2"
                  >
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Text className="font-body text-muted text-xs mb-4" numberOfLines={1}>
                  {selectedUser?.email}
                </Text>

                {/* Role Choice */}
                <ChoiceGroup
                  label="Penetapan Role Akses"
                  value={role}
                  onChange={(val) => setRole(val as 'Admin' | 'Kasir' | 'Customer')}
                  options={[
                    { value: 'Admin', label: 'Admin' },
                    { value: 'Kasir', label: 'Kasir' },
                    { value: 'Customer', label: 'Customer' },
                  ]}
                />

                {/* Status Choice */}
                <ChoiceGroup
                  label="Status Keaktifan Akun"
                  value={status}
                  onChange={(val) => setStatus(val as 'Aktif' | 'Nonaktif')}
                  options={[
                    { value: 'Aktif', label: 'Aktif' },
                    { value: 'Nonaktif', label: 'Nonaktif' },
                  ]}
                />

                {/* Relasi Employee */}
                <View className="mb-6">
                  <Text className="font-body-medium text-text text-sm mb-2">Tautkan ke Data Pegawai</Text>
                  <TouchableOpacity
                    onPress={() => setEmployeeId(null)}
                    className={`min-h-12 p-3.5 rounded-button border mb-2 justify-center ${
                      employeeId === null ? 'bg-primary/10 border-primary' : 'bg-surface border-line'
                    }`}
                  >
                    <Text className={`font-body text-xs ${employeeId === null ? 'font-bold text-primary' : 'text-text'}`}>
                      Tidak Terhubung (Customer Mandiri)
                    </Text>
                  </TouchableOpacity>

                  {employees.map((emp) => {
                    const isSelected = employeeId === emp.id;
                    return (
                      <TouchableOpacity
                        key={emp.id}
                        onPress={() => setEmployeeId(emp.id)}
                        className={`min-h-12 p-3.5 rounded-button border mb-2 justify-center ${
                          isSelected ? 'bg-primary/10 border-primary' : 'bg-surface border-line'
                        }`}
                      >
                        <Text className={`font-body text-xs ${isSelected ? 'font-bold text-primary' : 'text-text'}`}>
                          {emp.name} {emp.position ? `(${emp.position})` : ''} - Status: {emp.status}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Actions */}
                <View className="flex-row gap-3 mt-2 mb-2">
                  <Button
                    title="Batal"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setEditModalVisible(false)}
                  />
                  <Button
                    title="Simpan Perubahan"
                    variant="primary"
                    className="flex-1"
                    isLoading={submitting}
                    icon={<Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                    onPress={handleUpdate}
                  />
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Tambah Akun Internal Baru */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddModalVisible(false)}
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
                setAddModalVisible(false);
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
                  <Text className="font-heading text-text text-xl">Buat Akun Staf Internal</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Tutup dialog"
                    onPress={() => setAddModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    className="min-h-11 min-w-11 items-center justify-center -mr-2"
                  >
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Input
                  label="Alamat Email Akun *"
                  placeholder="staf@fantasicoffee.com"
                  value={newEmail}
                  onChangeText={(t) => {
                    setNewEmail(t);
                    if (newEmailError) setNewEmailError('');
                  }}
                  error={newEmailError}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  leftIcon={<Ionicons name="mail-outline" size={18} color="#6B7280" />}
                />

                <Input
                  label="Password Akun *"
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChangeText={(t) => {
                    setNewPassword(t);
                    if (newPasswordError) setNewPasswordError('');
                  }}
                  secureToggle
                  error={newPasswordError}
                  leftIcon={<Ionicons name="lock-closed-outline" size={18} color="#6B7280" />}
                />

                <ChoiceGroup
                  label="Pilih Role Internal"
                  value={newRole}
                  onChange={(val) => setNewRole(val as 'Admin' | 'Kasir')}
                  options={[
                    { value: 'Kasir', label: 'Kasir' },
                    { value: 'Admin', label: 'Admin' },
                  ]}
                />

                <View className="mb-6">
                  <Text className="font-body-medium text-text text-sm mb-2">Pilih Pegawai Terkait (Opsional)</Text>
                  <TouchableOpacity
                    onPress={() => setNewEmployeeId(null)}
                    className={`min-h-12 p-3.5 rounded-button border mb-2 justify-center ${
                      newEmployeeId === null ? 'bg-primary/10 border-primary' : 'bg-surface border-line'
                    }`}
                  >
                    <Text className={`font-body text-xs ${newEmployeeId === null ? 'font-bold text-primary' : 'text-text'}`}>
                      Belum Ditautkan
                    </Text>
                  </TouchableOpacity>

                  {employees.map((emp) => {
                    const isSelected = newEmployeeId === emp.id;
                    return (
                      <TouchableOpacity
                        key={emp.id}
                        onPress={() => setNewEmployeeId(emp.id)}
                        className={`min-h-12 p-3.5 rounded-button border mb-2 justify-center ${
                          isSelected ? 'bg-primary/10 border-primary' : 'bg-surface border-line'
                        }`}
                      >
                        <Text className={`font-body text-xs ${isSelected ? 'font-bold text-primary' : 'text-text'}`}>
                          {emp.name} {emp.position ? `(${emp.position})` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="flex-row gap-3 mt-2 mb-2">
                  <Button
                    title="Batal"
                    variant="outline"
                    className="flex-1"
                    onPress={() => setAddModalVisible(false)}
                  />
                  <Button
                    title="Buat Akun Staf"
                    variant="primary"
                    className="flex-1"
                    isLoading={creatingUser}
                    icon={<Ionicons name="person-add-outline" size={18} color="#FFFFFF" />}
                    onPress={handleCreateInternalUser}
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

