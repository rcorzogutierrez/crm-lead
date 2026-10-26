import { describe, expect, it } from 'vitest';
import { DealLine, dealLines, linesPricing, linesValue, pricedLines, staleLines } from './deal-lines';
import { ServiceItem } from './models';

const svc = (id: string, price: number, unit = 'persona'): ServiceItem => ({ id, kind: 'service', name: id, description: '', price, unit, active: true, taxable: true });
const catalog = new Map([
  ['paquete', svc('paquete', 1200)],
  ['tour', svc('tour', 180)],
  ['seguro', svc('seguro', 50, '')],
]);
const line = (serviceId: string, unitPrice: number, quantity = 1, ack: number | null = null): DealLine => ({
  serviceId,
  serviceName: serviceId,
  quantity,
  unitPrice,
  ack,
});

describe('líneas de un negocio', () => {
  it('el valor es la suma de cada línea con el % de la categoría, a centavos', () => {
    // 2 × 1200 × 1.03 = 2472 · 3 × 180 × 1.03 = 556.2
    expect(linesValue([line('paquete', 1200, 2), line('tour', 180, 3)], 3)).toBe(3028.2);
  });

  it('el primer servicio va en los campos del lead y los demás en extras', () => {
    const p = linesPricing([line('paquete', 1200, 2), line('tour', 180)], 'bronze', 3);
    expect(p.serviceId).toBe('paquete');
    expect(p.quantity).toBe(2);
    expect(p.extras).toEqual([line('tour', 180)]);
    expect(p.value).toBe(2657.4);
    expect(dealLines({ ...p, priceAck: null })).toEqual([line('paquete', 1200, 2), line('tour', 180)]);
  });

  it('un servicio en su lugar conserva el precio pactado; uno nuevo o movido toma el de hoy', () => {
    const before = [line('paquete', 1000), line('tour', 150, 1, 180)];
    const kept = pricedLines([{ serviceId: 'paquete', quantity: 2 }, { serviceId: 'tour', quantity: 1 }], catalog, before);
    expect(kept.map((x) => [x.unitPrice, x.ack])).toEqual([[1000, null], [150, 180]]);
    // Al quitar el paquete, el tour pasa a ser el primero: va al precio de hoy.
    const moved = pricedLines([{ serviceId: 'tour', quantity: 1 }], catalog, before);
    expect(moved[0].unitPrice).toBe(180);
  });

  it('las líneas vacías no cuentan y lo que no se cobra por unidad va con cantidad 1', () => {
    const out = pricedLines([{ serviceId: 'seguro', quantity: 4 }, { serviceId: '', quantity: 1 }], catalog);
    expect(out).toEqual([{ serviceId: 'seguro', serviceName: 'seguro', quantity: 1, unitPrice: 50, ack: null }]);
  });

  it('avisa de los precios oficiales nuevos que no se descartaron', () => {
    const lines = [line('paquete', 1000), line('tour', 150, 1, 180), line('seguro', 50)];
    expect(staleLines(lines, catalog)).toEqual([{ index: 0, name: 'paquete', from: 1000, to: 1200 }]);
  });
});
