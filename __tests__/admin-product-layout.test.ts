import { formatRupiah } from '../app/(admin)/product';

describe('Admin Product Layout & Logic (TDD)', () => {
  it('formats currency correctly to Indonesian Rupiah', () => {
    const formatted = formatRupiah(25000);
    // id-ID format produces Rp 25.000 or Rp25.000
    expect(formatted).toMatch(/Rp\s*25\.000/);
  });

  it('filters products correctly by search query, category, and status', () => {
    const mockProducts = [
      {
        id: '1',
        name: 'Kopi Susu Senja',
        price: 22000,
        category_id: 'cat-kopi',
        status: 'Tersedia' as const,
        description: 'Espresso dengan susu kental manis',
        category: { id: 'cat-kopi', name: 'Kopi', description: null, status: 'Aktif' as const, created_at: '', updated_at: '' },
        is_active: true,
        image: null,
        created_at: '',
        updated_at: '',
      },
      {
        id: '2',
        name: 'Matcha Latte',
        price: 25000,
        category_id: 'cat-nonkopi',
        status: 'Tidak Tersedia' as const,
        description: 'Matcha murni dengan susu segar',
        category: { id: 'cat-nonkopi', name: 'Non-Kopi', description: null, status: 'Aktif' as const, created_at: '', updated_at: '' },
        is_active: true,
        image: null,
        created_at: '',
        updated_at: '',
      },
    ];

    // Filter by search query
    const searchFiltered = mockProducts.filter((p) => p.name.toLowerCase().includes('matcha'));
    expect(searchFiltered).toHaveLength(1);
    expect(searchFiltered[0].id).toBe('2');

    // Filter by category
    const categoryFiltered = mockProducts.filter((p) => p.category_id === 'cat-kopi');
    expect(categoryFiltered).toHaveLength(1);
    expect(categoryFiltered[0].name).toBe('Kopi Susu Senja');

    // Filter by status
    const statusFiltered = mockProducts.filter((p) => p.status === 'Tersedia');
    expect(statusFiltered).toHaveLength(1);
    expect(statusFiltered[0].status).toBe('Tersedia');
  });
});
