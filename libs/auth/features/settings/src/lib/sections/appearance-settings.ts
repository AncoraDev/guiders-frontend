import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService, THEME_OPTIONS, SidebarTheme } from '@guiders-frontend/shared/data-access/theme';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import { SettingsRowComponent } from '../components/settings-row';
import { SettingsSectionHeaderComponent } from '../components/settings-section-header';

@Component({
  selector: 'lib-appearance-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, SettingsRowComponent, SettingsSectionHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './appearance-settings.html',
  styleUrl: './appearance-settings.scss',
})
export class AppearanceSettingsComponent {
  readonly themeService = inject(ThemeService);
  private readonly toast = inject(ToastService);

  readonly darkThemes = THEME_OPTIONS.filter((t) => t.group === 'dark');
  readonly lightThemes = THEME_OPTIONS.filter((t) => t.group === 'light');
  readonly companyThemes = THEME_OPTIONS.filter((t) => t.group === 'company');

  onSelectTheme(themeId: string): void {
    this.themeService.setTheme(themeId as SidebarTheme);
    this.toast.success('Tema actualizado');
  }
}
