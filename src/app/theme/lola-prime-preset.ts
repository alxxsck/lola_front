import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

const surface = {
  0: 'var(--palette-surface-0)',
  50: 'var(--palette-surface-50)',
  100: 'var(--palette-surface-100)',
  200: 'var(--palette-surface-200)',
  300: 'var(--palette-surface-300)',
  400: 'var(--palette-surface-400)',
  500: 'var(--palette-surface-500)',
  600: 'var(--palette-surface-600)',
  700: 'var(--palette-surface-700)',
  800: 'var(--palette-surface-800)',
  900: 'var(--palette-surface-900)',
  950: 'var(--palette-surface-950)',
}

const primary = {
  color: 'var(--action-primary)',
  contrastColor: 'var(--on-action-primary)',
  hoverColor: 'var(--action-primary-hover)',
  activeColor: 'var(--action-primary-active)',
}

const highlight = {
  background: 'var(--status-violet-soft)',
  focusBackground: 'var(--surface-active)',
  color: 'var(--status-violet-text)',
  focusColor: 'var(--text-primary)',
}

const formField = {
  background: 'var(--input-background)',
  disabledBackground: 'var(--input-disabled)',
  filledBackground: 'var(--surface-subtle)',
  filledHoverBackground: 'var(--surface-hover)',
  filledFocusBackground: 'var(--surface-hover)',
  borderColor: 'var(--input-border)',
  hoverBorderColor: 'var(--input-border-hover)',
  focusBorderColor: 'var(--focus-ring)',
  invalidBorderColor: 'var(--status-danger)',
  color: 'var(--text-primary)',
  disabledColor: 'var(--text-disabled)',
  placeholderColor: 'var(--input-placeholder)',
  invalidPlaceholderColor: 'var(--status-danger-text)',
  iconColor: 'var(--text-tertiary)',
}

const toast = {
  info: {
    background: 'var(--status-info-soft)',
    borderColor: 'var(--status-info)',
    color: 'var(--status-info-text)',
    detailColor: 'var(--text-primary)',
  },
  success: {
    background: 'var(--status-success-soft)',
    borderColor: 'var(--status-success)',
    color: 'var(--status-success-text)',
    detailColor: 'var(--text-primary)',
  },
  warn: {
    background: 'var(--status-warning-soft)',
    borderColor: 'var(--status-warning)',
    color: 'var(--status-warning-text)',
    detailColor: 'var(--text-primary)',
  },
  error: {
    background: 'var(--status-danger-soft)',
    borderColor: 'var(--status-danger)',
    color: 'var(--status-danger-text)',
    detailColor: 'var(--text-primary)',
  },
}

export const LolaPrimePreset = definePreset(Aura, {
  primitive: {
    violet: {
      50: 'var(--palette-violet-50)',
      100: 'var(--palette-violet-100)',
      200: 'var(--palette-violet-200)',
      300: 'var(--palette-violet-300)',
      400: 'var(--palette-violet-400)',
      500: 'var(--palette-violet-500)',
      600: 'var(--palette-violet-600)',
      700: 'var(--palette-violet-700)',
      800: 'var(--palette-violet-800)',
      900: 'var(--palette-violet-900)',
      950: 'var(--palette-violet-950)',
    },
  },
  semantic: {
    primary: {
      50: '{violet.50}',
      100: '{violet.100}',
      200: '{violet.200}',
      300: '{violet.300}',
      400: '{violet.400}',
      500: '{violet.500}',
      600: '{violet.600}',
      700: '{violet.700}',
      800: '{violet.800}',
      900: '{violet.900}',
      950: '{violet.950}',
    },
    focusRing: {
      color: 'var(--focus-ring)',
    },
    colorScheme: {
      light: {
        surface,
        primary,
        highlight,
        formField,
      },
      dark: {
        surface,
        primary,
        highlight,
        formField,
      },
    },
  },
  components: {
    skeleton: {
      colorScheme: {
        light: { root: { background: 'var(--surface-active)', animationBackground: 'var(--surface-hover)' } },
        dark: { root: { background: 'var(--surface-active)', animationBackground: 'var(--surface-hover)' } },
      },
    },
    toast: {
      colorScheme: {
        light: toast,
        dark: toast,
      },
    },
  },
})
