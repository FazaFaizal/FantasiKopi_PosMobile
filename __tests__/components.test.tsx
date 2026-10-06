import React from 'react';
// @ts-expect-error react-dom types not installed in React Native/Expo project
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge, statusTone } from '../components/Badge';
import { Button } from '../components/Button';
import { ChoiceGroup } from '../components/ChoiceGroup';
import { Input } from '../components/Input';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

describe('Shared UI Components (Iterasi 1 & 2)', () => {
  describe('Badge component', () => {
    it('returns proper tone classes for success, danger, warning, and neutral', () => {
      expect(statusTone('Aktif')).toBe('success');
      expect(statusTone('Nonaktif')).toBe('danger');
      expect(statusTone('Lainnya')).toBe('danger');

      const successBadge = Badge({ label: 'Tersedia', tone: 'success' });
      expect(successBadge.props.className).toContain('bg-success-soft');

      const dangerBadge = Badge({ label: 'Habis', tone: 'danger' });
      expect(dangerBadge.props.className).toContain('bg-danger-soft');

      const warningBadge = Badge({ label: 'Low Stock', tone: 'warning' });
      expect(warningBadge.props.className).toContain('bg-warning-soft');

      const defaultBadge = Badge({ label: 'Netral' });
      expect(defaultBadge.props.className).toContain('bg-surface');
    });

    it('renders label text correctly', () => {
      const badge = Badge({ label: 'Admin', tone: 'accent' });
      const textChild = badge.props.children[1];
      expect(textChild.props.children).toBe('Admin');
      expect(textChild.props.className).toContain('text-primary');
    });
  });

  describe('Button component', () => {
    it('applies variant and size classes properly', () => {
      const primaryBtn = Button({ title: 'Simpan', variant: 'primary', size: 'md' });
      expect(primaryBtn.props.className).toContain('bg-primary');
      expect(primaryBtn.props.className).toContain('min-h-12');

      const outlineBtn = Button({ title: 'Batal', variant: 'outline', size: 'sm' });
      expect(outlineBtn.props.className).toContain('border-primary');
      expect(outlineBtn.props.className).toContain('min-h-10');

      const dangerBtn = Button({ title: 'Hapus', variant: 'danger', size: 'lg' });
      expect(dangerBtn.props.className).toContain('bg-danger');
      expect(dangerBtn.props.className).toContain('min-h-14');
    });

    it('handles disabled state', () => {
      const disabledBtn = Button({ title: 'Kirim', disabled: true });
      expect(disabledBtn.props.disabled).toBe(true);
      expect(disabledBtn.props.accessibilityState.disabled).toBe(true);
      expect(disabledBtn.props.className).toContain('opacity-50');
    });

    it('shows ActivityIndicator when isLoading is true', () => {
      const loadingBtn = Button({ title: 'Memproses...', isLoading: true });
      expect(loadingBtn.props.disabled).toBe(true);
      expect(loadingBtn.props.accessibilityState.busy).toBe(true);
      const spinner = loadingBtn.props.children[0];
      expect(spinner).not.toBeNull();
      expect(spinner.props.size).toBe('small');
    });
  });

  describe('ChoiceGroup component', () => {
    it('renders options and highlights selected value', () => {
      const options = [
        { label: 'Admin', value: 'admin' },
        { label: 'Kasir', value: 'kasir' },
      ];
      const onChange = jest.fn();
      const choiceGroup = ChoiceGroup({
        label: 'Pilih Role',
        options,
        value: 'kasir',
        onChange,
      });

      expect(choiceGroup.props.children[0].props.children).toBe('Pilih Role');
      const buttonsContainer = choiceGroup.props.children[1];
      const renderedOptions = buttonsContainer.props.children;
      expect(renderedOptions).toHaveLength(2);

      // First option (admin) should not be selected
      expect(renderedOptions[0].props.accessibilityState.selected).toBe(false);
      expect(renderedOptions[0].props.className).toContain('bg-surface');

      // Second option (kasir) should be selected
      expect(renderedOptions[1].props.accessibilityState.selected).toBe(true);
      expect(renderedOptions[1].props.className).toContain('bg-primary');

      // Trigger selection
      renderedOptions[0].props.onPress();
      expect(onChange).toHaveBeenCalledWith('admin');
    });
  });

  describe('Input component', () => {
    it('renders label, placeholder, and normal state', () => {
      const html = renderToStaticMarkup(<Input label="Email Pengguna" placeholder="user@example.com" />);
      expect(html).toContain('Email Pengguna');
      expect(html).toContain('user@example.com');
      expect(html).toContain('border-line');
    });

    it('shows error message and error border styling when error is provided', () => {
      const html = renderToStaticMarkup(<Input label="Password" error="Minimal 6 karakter" />);
      expect(html).toContain('Minimal 6 karakter');
      expect(html).toContain('border-primary');
    });

    it('shows hint message when hint is provided and no error exists', () => {
      const html = renderToStaticMarkup(<Input label="Nama" hint="Gunakan nama lengkap sesuai KTP" />);
      expect(html).toContain('Gunakan nama lengkap sesuai KTP');
      expect(html).toContain('text-muted');
    });
  });

  describe('States components (LoadingState, EmptyState, ErrorState)', () => {
    it('renders LoadingState with default or custom label', () => {
      const defaultLoading = LoadingState({});
      const defaultText = defaultLoading.props.children[1];
      expect(defaultText.props.children).toBe('Memuat data...');

      const customLoading = LoadingState({ label: 'Menyinkronkan stok...' });
      const customText = customLoading.props.children[1];
      expect(customText.props.children).toBe('Menyinkronkan stok...');
    });

    it('renders EmptyState with title, description, and action button', () => {
      const onAction = jest.fn();
      const empty = EmptyState({
        title: 'Produk Kosong',
        description: 'Belum ada produk yang ditambahkan.',
        actionLabel: 'Tambah Produk',
        onAction,
      });

      const titleText = empty.props.children[1];
      expect(titleText.props.children).toBe('Produk Kosong');

      const descText = empty.props.children[2];
      expect(descText.props.children).toBe('Belum ada produk yang ditambahkan.');

      const actionBtn = empty.props.children[3];
      expect(actionBtn.props.title).toBe('Tambah Produk');
      actionBtn.props.onPress();
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('renders ErrorState with message and retry button', () => {
      const onRetry = jest.fn();
      const error = ErrorState({
        message: 'Koneksi database terputus',
        onRetry,
      });

      const titleText = error.props.children[1];
      expect(titleText.props.children).toBe('Terjadi Kendala');

      const msgText = error.props.children[2];
      expect(msgText.props.children).toBe('Koneksi database terputus');

      const retryBtn = error.props.children[3];
      expect(retryBtn.props.title).toBe('Coba Memuat Lagi');
      retryBtn.props.onPress();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
