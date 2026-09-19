import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UserService } from '@guiders-frontend/auth/data-access/session';

/**
 * Contenedor de /captacion. El guion es configuración de la empresa (admin),
 * pero los leads que deja el asistente los trabaja el comercial, así que cada
 * pestaña tiene su propio permiso.
 */
@Component({
  selector: 'lib-captacion-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './captacion-shell.html',
  styleUrl: './captacion-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptacionShell {
  private readonly userService = inject(UserService);

  readonly isAdmin = computed(() => this.userService.hasRole('admin'));
}
