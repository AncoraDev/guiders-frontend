import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Visitor } from '@guiders-frontend/shared/types';
import { VisitorDetailPanel } from './visitor-detail-panel';

function visitor(status: Visitor['status'], userAgent?: string): Visitor {
  return {
    id: '738ea3ac-0000-4000-8000-000000000001',
    lifecycle: 'ANON',
    isNewVisitor: true,
    status,
    domain: 'autopractik.es',
    siteId: 'site-001',
    companyId: 'company-001',
    firstVisit: new Date('2026-10-08T10:00:00.000Z'),
    lastVisit: new Date('2026-10-08T10:05:00.000Z'),
    totalSessions: 1,
    totalPageViews: 1,
    averageSessionDuration: 0,
    hasActiveChat: true,
    totalChats: 0,
    userAgent,
  };
}

describe('VisitorDetailPanel', () => {
  let fixture: ComponentFixture<VisitorDetailPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisitorDetailPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(VisitorDetailPanel);
  });

  it('muestra la URL completa, el origen y el navegador, y no marca actual si está desconectado', () => {
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    fixture.componentRef.setInput('visitor', visitor('offline', edge));
    fixture.componentRef.setInput('pageHistoryTotal', 1);
    fixture.componentRef.setInput('pageHistory', [
      {
        url: 'https://autopractik.es/?utm=home',
        path: '/',
        occurredAt: '2026-10-08T10:00:00.000Z',
        index: 1,
        referrer: 'https://www.google.com/search?q=autopractik',
        userAgent: edge,
      },
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    const browser = Array.from(
      fixture.nativeElement.querySelectorAll('.visitor-detail-panel__traffic-row') as NodeListOf<HTMLElement>,
    ).find((row) => row.textContent?.includes('Navegador'));
    expect(text).toContain('https://autopractik.es/?utm=home');
    expect(text).toContain('https://www.google.com/search?q=autopractik');
    expect(text).toContain('Edge · Windows');
    expect(text).not.toContain(edge);
    expect(browser?.querySelector('dd')?.getAttribute('title')).toBe(edge);
    expect(text).not.toContain('actual');
  });

  it('marca actual solo en la última página si el visitante está en línea', () => {
    fixture.componentRef.setInput('visitor', visitor('online'));
    fixture.componentRef.setInput('pageHistoryTotal', 1);
    fixture.componentRef.setInput('pageHistory', [
      {
        url: 'https://autopractik.es/',
        occurredAt: '2026-10-08T10:00:00.000Z',
        index: 1,
        referrer: '',
      },
    ]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('actual');
    expect(text).toContain('Directo');
  });

  it('dice que el origen no está registrado cuando el evento no trae referrer', () => {
    fixture.componentRef.setInput('visitor', visitor('offline'));
    fixture.componentRef.setInput('pageHistoryTotal', 1);
    fixture.componentRef.setInput('pageHistory', [
      {
        url: 'https://autopractik.es/',
        occurredAt: '2026-10-08T10:00:00.000Z',
        index: 1,
      },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No registrado');
  });
});
