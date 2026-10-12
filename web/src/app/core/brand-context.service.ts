import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Brand } from './models';

const KEY = 'sp.currentBrand';

/**
 * Holds the brand list and the brand selected in the top bar.
 * Every brand-scoped page reads `currentBrandId()`.
 */
@Injectable({ providedIn: 'root' })
export class BrandContextService {
  private readonly api = inject(ApiService);
  readonly brands = signal<Brand[]>([]);
  readonly loaded = signal(false);
  private readonly selectedId = signal<string | null>(localStorage.getItem(KEY));

  readonly currentBrand = computed(() => {
    const list = this.brands();
    return list.find((b) => b.id === this.selectedId()) ?? list[0] ?? null;
  });
  readonly currentBrandId = computed(() => this.currentBrand()?.id ?? null);

  reload(): Observable<unknown> {
    return this.api.list<Brand>('/brands', { page: 1, limit: 100 }).pipe(
      tap((res) => {
        this.brands.set(res.items);
        this.loaded.set(true);
      }),
    );
  }

  select(brandId: string): void {
    localStorage.setItem(KEY, brandId);
    this.selectedId.set(brandId);
  }

  upsert(brand: Brand): void {
    const list = this.brands();
    const i = list.findIndex((b) => b.id === brand.id);
    this.brands.set(i >= 0 ? list.map((b) => (b.id === brand.id ? brand : b)) : [...list, brand].sort((a, b) => a.name.localeCompare(b.name)));
  }

  remove(brandId: string): void {
    this.brands.set(this.brands().filter((b) => b.id !== brandId));
  }
}
