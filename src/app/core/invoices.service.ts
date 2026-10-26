import { Service, effect, inject, signal } from '@angular/core';
import {
  DocumentData,
  Timestamp,
  WriteBatch,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { CatalogService } from './catalog.service';
import { Company, CompanyService, companyAddress } from './company.service';
import { FIRESTORE } from './firebase';
import { toDate } from './firestore-utils';
import { t } from './i18n/i18n';
import { InvoiceLine, InvoiceTotals, invoiceLabel, invoiceLines, invoiceTotals } from './invoice-math';
import { Lead } from './models';

export interface InvoiceParty {
  name: string;
  company: string;
  email: string;
  phone: string;
  /** Dirección de facturación, en varias líneas. */
  address: string;
}

/** Datos del emisor copiados al emitir (el logo se lee de la empresa al mostrarla). */
export interface InvoiceIssuer {
  legalName: string;
  tradeName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

/**
 * Factura (`invoices/{número}`). Se emite desde una venta ganada y no se edita: si hay un
 * error, un admin la anula y se emite otra con el número siguiente.
 */
export interface Invoice extends InvoiceTotals {
  id: string;
  number: number;
  prefix: string;
  leadId: string;
  contactId: string | null;
  assigneeId: string;
  billTo: InvoiceParty;
  issuer: InvoiceIssuer;
  lines: InvoiceLine[];
  currency: 'USD';
  notes: string;
  dueAt: Date | null;
  status: 'issued' | 'void';
  issuedAt: Date | null;
  issuedBy: string;
  issuedByName: string;
  voidReason: string;
  voidedAt: Date | null;
}

export interface IssueInput {
  address: string;
  notes: string;
  dueAt: Date | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function mapInvoice(id: string, d: DocumentData): Invoice {
  const bill = (d['billTo'] ?? {}) as Record<string, unknown>;
  const iss = (d['issuer'] ?? {}) as Record<string, unknown>;
  return {
    id,
    number: Number(d['number'] ?? 0),
    prefix: str(d['prefix']),
    leadId: str(d['leadId']),
    contactId: d['contactId'] ?? null,
    assigneeId: str(d['assigneeId']),
    billTo: { name: str(bill['name']), company: str(bill['company']), email: str(bill['email']), phone: str(bill['phone']), address: str(bill['address']) },
    issuer: {
      legalName: str(iss['legalName']),
      tradeName: str(iss['tradeName']),
      taxId: str(iss['taxId']),
      address: str(iss['address']),
      phone: str(iss['phone']),
      email: str(iss['email']),
      website: str(iss['website']),
    },
    lines: Array.isArray(d['lines'])
      ? (d['lines'] as DocumentData[]).map((l) => ({
          name: str(l['name']),
          quantity: Number(l['quantity'] ?? 1),
          unit: str(l['unit']),
          unitPrice: Number(l['unitPrice'] ?? 0),
          amount: Number(l['amount'] ?? 0),
          taxable: l['taxable'] !== false,
        }))
      : [],
    subtotal: Number(d['subtotal'] ?? 0),
    taxable: Number(d['taxable'] ?? 0),
    taxRate: Number(d['taxRate'] ?? 0),
    tax: Number(d['tax'] ?? 0),
    total: Number(d['total'] ?? 0),
    currency: 'USD',
    notes: str(d['notes']),
    dueAt: toDate(d['dueAt']),
    status: d['status'] === 'void' ? 'void' : 'issued',
    issuedAt: toDate(d['issuedAt']),
    issuedBy: str(d['issuedBy']),
    issuedByName: str(d['issuedByName']),
    voidReason: str(d['voidReason']),
    voidedAt: toDate(d['voidedAt']),
  };
}

function issuerOf(c: Company): InvoiceIssuer {
  return {
    legalName: c.legalName,
    tradeName: c.tradeName,
    taxId: c.taxId,
    address: companyAddress(c).join('\n'),
    phone: c.phone,
    email: c.email,
    website: c.website,
  };
}

/**
 * Emisión y anulación de facturas. Factura el responsable de la venta o un admin; el número
 * sale de `meta/invoiceSeq` y se sube en el mismo lote; las reglas impiden saltarlo o repetirlo.
 */
@Service()
export class InvoicesService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly companies = inject(CompanyService);

  private readonly _next = signal<number | null>(null);
  /** Próximo número de factura (null mientras carga). */
  readonly nextNumber = this._next.asReadonly();

  constructor() {
    effect((onCleanup) => {
      if (this.auth.status() !== 'member') return;
      const stop = onSnapshot(
        doc(this.db, 'meta', 'invoiceSeq'),
        (snap) => this._next.set(Number(snap.data()?.['next'] ?? 1)),
        (err) => console.error(err),
      );
      onCleanup(stop);
    });
  }

  /** Escucha una factura; devuelve la función para dejar de escuchar. */
  watch(id: string, next: (inv: Invoice | null) => void, fail: (err: unknown) => void): () => void {
    return onSnapshot(
      doc(this.db, 'invoices', id),
      (snap) => next(snap.exists() ? mapInvoice(snap.id, snap.data()) : null),
      fail,
    );
  }

  /** Vista previa de lo que se va a facturar, con el impuesto vigente de la empresa. */
  preview(lead: Lead): { lines: InvoiceLine[] } & InvoiceTotals {
    const lines = invoiceLines(lead, this.catalog.byId());
    return { lines, ...invoiceTotals(lines, this.companies.company().taxRate) };
  }

  /**
   * Emite la factura: número siguiente, factura, contador y venta en el mismo lote. Si otra
   * persona emitió a la vez con ese número, las reglas rechazan el lote entero y se reintenta
   * con el siguiente (un lote no carga el código de transacciones en el bundle inicial).
   */
  async issue(lead: Lead, input: IssueInput): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const seq = await getDoc(doc(this.db, 'meta', 'invoiceSeq'));
      const number = seq.exists() ? Number(seq.data()['next']) : 1;
      try {
        await this.issueBatch(lead, input, number).commit();
        return String(number);
      } catch (err) {
        if (attempt >= 2 || (err as { code?: string })?.code !== 'permission-denied') throw err;
      }
    }
  }

  private issueBatch(lead: Lead, input: IssueInput, number: number): WriteBatch {
    const company = this.companies.company();
    const { lines, ...totals } = this.preview(lead);
    const user = this.auth.user();
    const id = String(number);
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, 'invoices', id), {
      number,
      prefix: company.invoicePrefix,
      leadId: lead.id,
      contactId: lead.contactId,
      assigneeId: lead.assigneeId,
      billTo: { name: lead.name, company: lead.company, email: lead.email, phone: lead.phone, address: input.address.trim() },
      issuer: issuerOf(company),
      lines,
      ...totals,
      currency: 'USD',
      notes: input.notes.trim(),
      dueAt: input.dueAt ? Timestamp.fromDate(input.dueAt) : null,
      status: 'issued',
      issuedAt: serverTimestamp(),
      issuedBy: this.auth.uid(),
      issuedByName: user?.displayName ?? user?.email ?? '',
    });
    batch.set(doc(this.db, 'meta', 'invoiceSeq'), { next: number + 1, updatedAt: serverTimestamp() });
    batch.update(doc(this.db, 'leads', lead.id), { invoiceId: id, updatedAt: serverTimestamp() });
    batch.set(doc(collection(this.db, 'leads', lead.id, 'activities')), {
      type: 'invoice',
      body: t('invoice.activityIssued', { n: invoiceLabel({ prefix: company.invoicePrefix, number }) }),
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    return batch;
  }

  /** Solo admin: anula la factura y libera la venta para volver a facturarla. */
  async void(inv: Invoice, reason: string): Promise<void> {
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'invoices', inv.id), {
      status: 'void',
      voidReason: reason.trim(),
      voidedAt: serverTimestamp(),
      voidedBy: this.auth.uid(),
    });
    batch.update(doc(this.db, 'leads', inv.leadId), { invoiceId: null, updatedAt: serverTimestamp() });
    batch.set(doc(collection(this.db, 'leads', inv.leadId, 'activities')), {
      type: 'invoice',
      body: t('invoice.activityVoided', { n: invoiceLabel(inv), reason: reason.trim() }),
      createdBy: this.auth.uid(),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  /** Solo admin: número con el que arranca (o sigue) la numeración. Nunca hacia atrás. */
  setNextNumber(next: number): Promise<void> {
    return setDoc(doc(this.db, 'meta', 'invoiceSeq'), { next, updatedAt: serverTimestamp() });
  }
}
