---
name: ask-sonner
description: Implement or troubleshoot Sonner toast notifications in a React application. Use only when the project uses Sonner and the task concerns toast setup, lifecycle, feedback, styling, layering, themes, duplication, or accessibility.
---

# Sonner Toasts

Use Sonner for brief, non-blocking feedback. Preserve the application's existing
toast wrapper, theme, placement, and copy conventions.

1. Confirm Sonner is installed and inspect the existing `Toaster` placement and
   toast utilities before editing.
2. Mount one intentional `Toaster` near the application root unless the product
   explicitly needs isolated regions.
3. Choose the lifecycle that matches the operation:
   - `toast.success` or `toast.error` for a completed result;
   - `toast.promise` for one asynchronous operation with loading/success/error;
   - a stable toast ID when updating or deduplicating repeated events;
   - persistent toasts only when the user must act on them.
4. Keep messages specific and concise. Do not use a toast as the only location
   for form validation, destructive confirmation, or information the user must
   revisit.
5. Match theme and stacking context. Diagnose duplicate toasters, clipped
   portals, modal layering, and missing styles before adding overrides.
6. Verify success, failure, repeated invocation, keyboard/screen-reader impact,
   narrow viewport placement, and dismissal behavior.

Do not replace inline errors with toasts and do not introduce another toast
library when Sonner already satisfies the requirement.
