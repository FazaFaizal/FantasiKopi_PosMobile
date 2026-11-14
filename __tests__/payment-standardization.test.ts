/**
 * #7 STANDARDISASI STATUS & METODE PEMBAYARAN (PRD Section 16)
 * - Status pembayaran hanya: Pending, Paid, Failed, Refunded.
 *   'Lunas' → 'Paid'; order belum dibayar yang dibatalkan tetap 'Pending' (bukan 'Batal').
 * - Metode pembayaran: Tunai, QRIS, Debit (Debit = non-tunai, tidak masuk laci).
 * - Tampilan memakai label Indonesia.
 */
import {
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  isPaymentSettled,
  getCancellationPaymentStatus,
  getPaymentStatusMeta,
  getPaymentMethodMeta,
} from '../lib/order-logic';
import { validateOrderPayload } from '../lib/pos-logic';
import { validateCustomerCheckoutPayload } from '../lib/customer-order-logic';
import { calculateDailyCashRecap } from '../lib/cash-logic';

declare const require: (id: 'fs') => {
  readFileSync(file: string, encoding: 'utf8'): string;
  readdirSync(dir: string): string[];
};
declare const __dirname: string;
const fs = require('fs');
const ROOT = `${__dirname}/..`;
const read = (rel: string) => fs.readFileSync(`${ROOT}/${rel}`, 'utf8');
const normalize = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

describe('Status pembayaran baku', () => {
  it('hanya empat status sesuai PRD', () => {
    expect(PAYMENT_STATUSES).toEqual(['Pending', 'Paid', 'Failed', 'Refunded']);
  });

  it('lunas hanya jika Paid', () => {
    expect(isPaymentSettled('Paid')).toBe(true);
    for (const s of ['Pending', 'Failed', 'Refunded', 'Lunas', 'Batal']) {
      expect(isPaymentSettled(s)).toBe(false);
    }
  });

  it('pembatalan: Paid → Refunded, belum dibayar tetap Pending', () => {
    expect(getCancellationPaymentStatus('Paid')).toBe('Refunded');
    expect(getCancellationPaymentStatus('Pending')).toBe('Pending');
    expect(getCancellationPaymentStatus('Failed')).toBe('Failed');
  });

  it('label tampilan berbahasa Indonesia', () => {
    expect(getPaymentStatusMeta('Paid', 'Completed')).toEqual({ label: 'Lunas', tone: 'success' });
    expect(getPaymentStatusMeta('Pending', 'Pending')).toEqual({ label: 'Belum Dibayar', tone: 'warning' });
    expect(getPaymentStatusMeta('Pending', 'Cancelled')).toEqual({ label: 'Tidak Dibayar', tone: 'neutral' });
    expect(getPaymentStatusMeta('Refunded', 'Cancelled')).toEqual({ label: 'Dikembalikan', tone: 'danger' });
    expect(getPaymentStatusMeta('Failed', 'Pending')).toEqual({ label: 'Gagal', tone: 'danger' });
  });
});

describe('Metode pembayaran', () => {
  it('Tunai, QRIS, Debit', () => {
    expect(PAYMENT_METHODS).toEqual(['Tunai', 'QRIS', 'Debit']);
    expect(getPaymentMethodMeta('Tunai').isCash).toBe(true);
    expect(getPaymentMethodMeta('QRIS').isCash).toBe(false);
    expect(getPaymentMethodMeta('Debit')).toMatchObject({ label: 'Debit', isCash: false });
  });

  it('POS: Debit tidak memerlukan uang tunai diterima', () => {
    const cart = [{ productId: 'p', productName: 'Kopi', unitPrice: 20000, quantity: 1 }];
    expect(validateOrderPayload({ cart, paymentMethod: 'Debit' }).isValid).toBe(true);
  });

  it('Customer: boleh memilih Debit (bayar di kasir)', () => {
    const r = validateCustomerCheckoutPayload({
      cart: [{ productId: 'p', productName: 'Kopi', unitPrice: 20000, quantity: 1, status: 'Tersedia', is_active: true }],
      customerName: 'Budi',
      orderType: 'Take Away',
      paymentMethod: 'Debit',
    });
    expect(r.isValid).toBe(true);
  });

  it('Rekap kas: Debit dipisahkan dan tidak masuk uang laci', () => {
    const recap = calculateDailyCashRecap(
      [
        { payment_method: 'Tunai', payment_status: 'Paid', order_status: 'Completed', total_amount: 50000, created_at: '2026-11-13T02:00:00Z' },
        { payment_method: 'Debit', payment_status: 'Paid', order_status: 'Completed', total_amount: 70000, created_at: '2026-11-13T03:00:00Z' },
        { payment_method: 'QRIS', payment_status: 'Paid', order_status: 'Ready', total_amount: 30000, created_at: '2026-11-13T04:00:00Z' },
      ],
      [],
      '2026-11-13'
    );
    expect(recap.cashSales).toBe(50000);
    expect(recap.debitSales).toBe(70000);
    expect(recap.debitOrderCount).toBe(1);
    expect(recap.qrisSales).toBe(30000);
    expect(recap.totalSales).toBe(150000);
    expect(recap.expectedCash).toBe(50000);
  });
});

describe.each([
  ['migration', 'supabase/migrations/20261113000001_standardize_payment_status.sql'],
  ['schema', 'supabase/schema.sql'],
])('SQL (%s)', (_label, file) => {
  let sql: string;
  beforeAll(() => {
    sql = normalize(read(file));
  });

  it('constraint status pembayaran hanya empat nilai', () => {
    expect(sql).toContain("check (payment_status in ('pending', 'paid', 'failed', 'refunded'))");
  });

  it('metode pembayaran mencakup Debit', () => {
    expect(sql).toContain("check (payment_method in ('tunai', 'qris', 'debit'))");
  });

  it('fungsi tidak lagi mengenal Lunas/Batal', () => {
    expect(sql).toContain("new.payment_status <> 'paid'");
    // Hanya pernyataan UPDATE data lama di migration yang boleh menyebut nilai lama.
    const withoutDataFix = sql.replace(/update public\.orders set payment_status = '[a-z]+' where payment_status = '(lunas|batal)';/g, '');
    expect(withoutDataFix).not.toMatch(/'lunas'|'batal'/);
  });

  it('ringkasan sif memisahkan Debit', () => {
    expect(sql).toContain("'debit_in'");
  });
});

describe('Migration data lama', () => {
  it('mengubah Lunas → Paid dan Batal → Pending sebelum constraint baru dipasang', () => {
    const sql = normalize(read('supabase/migrations/20261113000001_standardize_payment_status.sql'));
    const toPaid = sql.indexOf("set payment_status = 'paid' where payment_status = 'lunas'");
    const toPending = sql.indexOf("set payment_status = 'pending' where payment_status = 'batal'");
    const check = sql.indexOf("check (payment_status in ('pending', 'paid', 'failed', 'refunded'))");
    expect(toPaid).toBeGreaterThan(-1);
    expect(toPending).toBeGreaterThan(-1);
    expect(toPaid).toBeLessThan(check);
    expect(toPending).toBeLessThan(check);
  });
});

describe('Kode aplikasi tidak lagi menulis status lama', () => {
  const files = [
    'app/(kasir)/pos.tsx',
    'components/OrdersScreen.tsx',
    'app/(customer)/product.tsx',
    'app/(customer)/orders.tsx',
    'lib/order-logic.ts',
    'types/database.ts',
  ];
  // Label tampilan "Lunas" dan tombol "Batal" boleh; yang dilarang adalah NILAI status lama.
  const LEGACY_STATUS = /(payment_status|PaymentStatus|nextPaymentStatus)[^\n]{0,60}['"](Lunas|Batal)['"]/;
  it.each(files)('%s bebas nilai status Lunas/Batal', (file) => {
    expect(read(file)).not.toMatch(LEGACY_STATUS);
  });
});
