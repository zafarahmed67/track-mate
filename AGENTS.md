# Agent Guidelines for Track-Mate

This document provides essential information for agentic coding assistants working on this Next.js project.

## Project Overview

- **Framework**: Next.js 16.1.6 (App Router)
- **React**: 19.2.3
- **TypeScript**: 5.x with strict mode enabled
- **Styling**: Tailwind CSS 4 with shadcn/ui (Radix Nova style)
- **Package Manager**: npm

## Build/Lint/Test Commands

### Development
```bash
npm run dev          # Start dev server on http://localhost:3000
```

### Build & Production
```bash
npm run build        # Production build (type-checks + builds)
npm start            # Start production server
```

### Linting
```bash
npm run lint         # Run ESLint on entire codebase
npx eslint <file>    # Lint specific file
```

### Type Checking
```bash
npx tsc --noEmit     # Type-check without emitting files
```

### Testing
**Note**: No test framework is currently configured. If adding tests, recommend:
- Jest + React Testing Library for unit/integration tests
- Playwright or Cypress for E2E tests

## Project Structure

```
/src
  /app              # Next.js App Router pages and layouts
  /components       # React components
    /ui             # shadcn/ui components
  /hooks            # Custom React hooks
  /lib              # Utility functions and shared code
```

## Code Style Guidelines

### Import Organization

1. **External libraries first** (React, Next.js, third-party)
2. **Internal utilities/components** (using `@/` aliases)
3. **Types** (can be inline with type imports)

Example:
```typescript
import * as React from "react"
import { type Metadata } from "next"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
```

### Path Aliases

Always use path aliases defined in `tsconfig.json`:
- `@/*` maps to project root
- Prefer `@/components/ui/button` over relative paths like `../../components/ui/button`

### TypeScript

- **Strict mode enabled**: All code must pass strict TypeScript checks
- **Type imports**: Use `type` keyword for type-only imports: `import { type ClassValue } from "clsx"`
- **Explicit types**: Prefer explicit return types for functions
- **React types**: Use proper React types (`React.ComponentProps`, `React.ReactNode`, etc.)
- **Readonly props**: Use `Readonly<>` for props that shouldn't be mutated

Example:
```typescript
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ...
}
```

### Naming Conventions

- **Components**: PascalCase (e.g., `Button`, `UserProfile`)
- **Files**: kebab-case for utilities (e.g., `use-mobile.ts`), PascalCase for components (e.g., `Button.tsx`)
- **Functions**: camelCase (e.g., `getUserData`, `handleSubmit`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MOBILE_BREAKPOINT`)
- **Hooks**: Prefix with `use` (e.g., `useIsMobile`, `useAuth`)

### Component Patterns

#### Server Components (Default)
```typescript
// No "use client" directive = Server Component
export default function Page() {
  return <div>Server-rendered content</div>
}
```

#### Client Components
```typescript
"use client"

import { useState } from "react"

export function InteractiveComponent() {
  const [count, setCount] = useState(0)
  // ...
}
```

#### shadcn/ui Components
- Use `cn()` utility for className merging
- Use `cva()` for component variants
- Follow established patterns in `/src/components/ui`

Example:
```typescript
import { cn } from "@/lib/utils"

function Component({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("default-styles", className)} {...props} />
}
```

### Styling with Tailwind

- Use Tailwind utility classes directly
- Use `cn()` from `@/lib/utils` to merge classes conditionally
- Follow existing spacing/sizing patterns
- Support dark mode with `dark:` prefix
- Prefer Tailwind over custom CSS

### Error Handling

- Use proper TypeScript types for error boundaries
- Handle async operations with try/catch
- Provide meaningful error messages
- Use React Error Boundaries for component-level errors

### State Management

- Use React hooks (`useState`, `useReducer`) for local state
- Use Context API for shared state across components
- Consider Server Components to reduce client-side state
- Prefer server-side data fetching when possible

### Data Fetching

- Use Server Components for server-side data fetching
- Use `fetch` with Next.js automatic caching
- Handle loading and error states properly
- Use `Suspense` for async components

## ESLint Configuration

- Uses `eslint-config-next` (core web vitals + TypeScript)
- Ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

## Git Workflow

- Commit messages should be clear and descriptive
- Test builds before committing (`npm run build`)
- Ensure linting passes (`npm run lint`)

## Additional Notes

- **No test suite**: Tests need to be added if required
- **shadcn/ui**: UI components are from shadcn/ui library (Radix Nova style)
- **CSS Variables**: Uses CSS variables for theming (defined via Tailwind config)
- **RTL Support**: Not enabled (can be enabled in `components.json`)

## Common Tasks

### Adding a new UI component
```bash
npx shadcn@latest add <component-name>
```

### Adding a new page
Create file in `/src/app/[route]/page.tsx` following App Router conventions

### Adding a new hook
Create file in `/src/hooks/use-[name].ts` and export named function

---

Last updated: 2026-03-11
