import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideLucideConfig } from '@lucide/angular';
import { routes } from './app.routes';
import { provideFirebase } from './core/firebase';
import { I18nTitleStrategy } from './core/i18n/title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true }),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideFirebase(),
    provideLucideConfig({ strokeWidth: 1.75 }),
    { provide: TitleStrategy, useClass: I18nTitleStrategy },
  ],
};
