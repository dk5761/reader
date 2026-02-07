---
description: Feature Folder pattern
---

# Feature Implementation Pattern

This document describes the standard patterns for implementing features in this codebase. Use **automated-audit/Audios** as the reference for features with subfeatures, and **auth** for simpler flat features.

---

## Table of Contents

1. [Naming Conventions](#1-naming-conventions)
2. [Folder Structure](#2-folder-structure)
3. [API Layer](#3-api-layer)
4. [TanStack Router Integration](#4-tanstack-router-integration)
5. [Forms with React Hook Form](#5-forms-with-react-hook-form)
6. [Component Patterns](#6-component-patterns)
7. [Page Components](#7-page-components)
8. [Table Configurations](#8-table-configurations)
9. [Shared and UI Components](#9-shared-and-ui-components)

---

## 1. Naming Conventions

### Parent Features

- Use **lowercase kebab-case**
- Examples: `auth`, `automated-audit`, `dashboard`

### Subfeatures

- Use **CamelCase**
- Examples: `Audios`, `Dashboard`, `Performance`

### Files

| Type      | Pattern                  | Example                  |
| --------- | ------------------------ | ------------------------ |
| Types     | `[feature].types.ts`     | `audios.types.ts`        |
| Queries   | `[feature].queries.ts`   | `audios.queries.ts`      |
| Mutations | `[feature].mutations.ts` | `audios.mutations.ts`    |
| Constants | `[feature].constants.ts` | `audios.constants.ts`    |
| Form      | `[Name].form.tsx`        | `SingleUpload.form.tsx`  |
| Schema    | `[Name].schema.ts`       | `SingleUpload.schema.ts` |
| Pages     | `[PageName].tsx`         | `AudioList.tsx`          |
| Table Config | `[entityName].table.ts` | `userList.table.ts`      |

---

## 2. Folder Structure

### Feature with Subfeatures

```
src/features/automated-audit/
├── api/
│   └── queryFactory.ts               # Centralized query keys for entire parent feature
├── Audios/                           # CamelCase subfeature
│   ├── api/
│   │   ├── audios.constants.ts       # API URLs
│   │   ├── audios.types.ts           # TypeScript interfaces
│   │   ├── audios.queries.ts         # queryOptions/infiniteQueryOptions
│   │   └── audios.mutations.ts       # useMutation hooks
│   ├── components/
│   │   ├── CreateAuditBtn/
│   │   │   └── CreateAuditBtn.tsx
│   │   ├── Filters/
│   │   │   ├── Filters.tsx
│   │   │   └── components/           # Sub-components
│   │   └── SummaryCard/
│   ├── config/
│   │   ├── AudioDetailsFilters.config.ts
│   │   └── [entityName].table.ts     # Table column definitions (e.g., audios.table.ts)
│   ├── forms/
│   │   └── CreateAuditForm/
│   │       ├── SingleUpload.form.tsx
│   │       ├── SingleUpload.schema.ts
│   │       └── components/
│   ├── hooks/
│   ├── pages/
│   │   ├── AudioList.tsx
│   │   └── AudioDetails.tsx
│   └── index.ts                      # Barrel exports
├── Dashboard/                        # Another CamelCase subfeature
│   ├── api/
│   ├── pages/
│   └── ...
└── Performance/
```

**Reference:** [automated-audit/Audios](file:///Users/drshnk/Developer/office/audit-panel/src/features/automated-audit/Audios)

### Feature without Subfeatures (Flat)

```
src/features/auth/
├── api/
│   ├── auth.constant.ts
│   ├── auth.types.ts
│   ├── auth.queries.ts
│   ├── auth.mutation.ts
│   └── queryfactory.ts
├── constants/
├── forms/
│   ├── LoginForms/
│   │   ├── LoginForm.tsx
│   │   ├── LoginForms.schema.ts
│   │   ├── LoginForms.types.ts
│   │   └── index.ts
│   └── index.ts
├── pages/
└── index.ts
```

**Reference:** [auth](file:///Users/drshnk/Developer/office/audit-panel/src/features/auth)

---

## 3. API Layer

### 3.1 Query Factory

Centralized query keys at parent feature level:

```typescript
// api/queryFactory.ts
import { generateOptimizedOptions } from "@/utils/shared-utils";

export const queryFactory = {
  all: () => ["automated-audit"],

  audios: () => [...queryFactory.all(), "audios"],

  getAudits: (page: string, id?: string, options?: AuditListOptions) => [
    ...queryFactory.all(),
    "audits",
    generateOptimizedOptions({ page, id, ...options }),
  ],

  getAudioDetails: (id: string) => [...queryFactory.audios(), "details", id],

  getAudioSummary: (audioId: string, summaryId: string) => [
    ...queryFactory.getAudioDetails(audioId),
    "summary",
    summaryId,
  ],
};
```

**Reference:** [queryFactory.ts](file:///Users/drshnk/Developer/office/audit-panel/src/features/automated-audit/api/queryFactory.ts)

### 3.2 Types Definition

```typescript
// api/audios.types.ts
export interface Audit {
  client_audio_id: string;
  created_at: string;
  language: string;
  status: string;
  total_score: number;
  // ...
}

export interface AuditListResponse {
  audits: Audit[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditListOptions {
  agency_ref_number?: string;
  agent_ref_number?: string;
  language?: string;
  // ...
}
```

### 3.3 Query Functions

Using `queryOptions()` from TanStack Query:

```typescript
// api/audios.queries.ts
import { get } from "@/services/api/api";
import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import { queryFactory } from "../../api/queryFactory";

export const getAuditsListFn = ({
  page,
  id,
  options,
}: {
  page: string;
  id?: string;
  options?: AuditListOptions;
}) =>
  queryOptions({
    queryKey: queryFactory.getAudits(page, id, options),
    queryFn: async () => {
      const url = getAuditsUrl({ page, id, options });
      const response = await get<AuditListResponse>(url);
      return response;
    },
  });

export const getAudioDetailsFn = (id: string, enabled: boolean) =>
  queryOptions({
    queryKey: queryFactory.getAudioDetails(id),
    queryFn: async () => {
      const url = getAudiosDetailsUrl(id);
      const response = await get<AudioDetailsResponse>(url);
      return response;
    },
    enabled,
  });
```

**Reference:** [audios.queries.ts](file:///Users/drshnk/Developer/office/audit-panel/src/features/automated-audit/Audios/api/audios.queries.ts)

### 3.4 Infinite Queries

```typescript
export const getAgenciesListFn = (
  options: { search?: string },
  enabled: boolean = true
) =>
  infiniteQueryOptions({
    queryKey: queryFactory.getAgenciesList(options),
    queryFn: async ({ pageParam = 1 }) => {
      const url = getAgenciesUrl({ page: pageParam.toString(), ...options });
      const response = await get<AgencyListResponse>(url);
      return response;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.agencies && lastPage.agencies.length > 0) {
        return pages.length + 1;
      }
      return undefined;
    },
    enabled,
    select: (data) => ({
      agencies: data.pages?.flatMap((page) => page?.agencies ?? []) || [],
      current_page: data.pages[0]?.page || 1,
      total: data.pages[0]?.total || 0,
    }),
  });
```

### 3.5 Mutations

```typescript
// api/audios.mutations.ts
import { post } from "@/services/api/api";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/services/api/api.types";

export const useUploadAudioMutation = () => {
  return useMutation<
    any,
    ApiError,
    {
      file: File;
      fileName: string;
      templateRefNumber: string;
      metaData: MetaData;
    }
  >({
    mutationFn: async ({ file, fileName, templateRefNumber, metaData }) => {
      const audioUrl = await preUploadFile({
        fileName,
        contentType: "multipart/form-data",
        body: file,
      });

      const createAudioResponse = await createAudioUrl({
        params: {
          audio_url: audioUrl,
          template_ref_number: templateRefNumber,
          meta_data: metaData,
        },
      });

      return createAudioResponse;
    },
  });
};
```

**Reference:** [audios.mutations.ts](file:///Users/drshnk/Developer/office/audit-panel/src/features/automated-audit/Audios/api/audios.mutations.ts)

### 3.6 API Service

Centralized HTTP methods:

```typescript
// @/services/api/api.ts
import { get, post, patch, put } from "@/services/api/api";

// GET request
const response = await get<ResponseType>(url);

// POST request
const response = await post<ResponseType, PayloadType>(url, data);
```

---

## 4. TanStack Router Integration

### 4.1 Route File Structure

```
src/routes/
├── __root.tsx                        # Root layout
├── _authenticated.tsx                # Auth layout wrapper
├── _authenticated/
│   ├── automated-audits/
│   │   ├── index.tsx                 # Redirect route
│   │   ├── dashboard.tsx
│   │   └── call-recordings/
│   │       ├── index.tsx             # List page
│   │       └── $audioId.tsx          # Detail page (dynamic param)
│   └── dashboard.tsx
├── login.tsx
└── index.tsx
```

### 4.2 Layout Route

```typescript
// routes/_authenticated.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: "/" } });
    }
  },
  loader: async ({ context }) => {
    const [agentData, postLoginData, flags] = await Promise.all([
      context.queryClient.ensureQueryData(getAgentDetails()),
      context.queryClient.ensureQueryData(postLogin()),
      context.queryClient.ensureQueryData(
        getFlagsmithFlags(context.auth.token)
      ),
    ]);

    return { agentData, postLoginData, flags, sidebarItems };
  },
  component: () => (
    <MainLayoutShell>
      <Outlet />
    </MainLayoutShell>
  ),
});
```

**Reference:** [\_authenticated.tsx](file:///Users/drshnk/Developer/office/audit-panel/src/routes/_authenticated.tsx)

### 4.3 List Page Route with Search Params

```typescript
// routes/_authenticated/automated-audits/call-recordings/index.tsx
import { AudioList } from "@/features/automated-audit/Audios";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CallRecordingsPageSchema = z.object({
  page: z.string().optional().default("1"),
  agency_ref_number: z.string().optional(),
  agent_ref_number: z.string().optional(),
  language: z.string().optional(),
  created_at_to: z.string().optional(),
  created_at_from: z.string().optional(),
  agent_sentiment: z
    .union([z.literal("Negative"), z.literal("Positive"), z.literal("Neutral")])
    .optional(),
  audit_status: z
    .union([z.literal("eligible"), z.literal("ineligible")])
    .optional(),
});

export const Route = createFileRoute(
  "/_authenticated/automated-audits/call-recordings/"
)({
  validateSearch: CallRecordingsPageSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ context: { queryClient }, deps: { page } }) => {
    await queryClient.ensureQueryData(getAuditsListFn({ page }));

    // Prefetch related data
    try {
      await queryClient.ensureInfiniteQueryData(getAgenciesListFn({}));
    } catch (error) {
      console.warn("Failed to prefetch agencies list:", error);
    }
  },
  component: AudioList,
});
```

**Reference:** [call-recordings/index.tsx](file:///Users/drshnk/Developer/office/audit-panel/src/routes/_authenticated/automated-audits/call-recordings/index.tsx)

### 4.4 Detail Page Route with Dynamic Params

```typescript
// routes/_authenticated/automated-audits/call-recordings/$audioId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const AudioDetailsSchema = z.object({
  transcriptionId: z.string().optional(),
  summaryId: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/automated-audits/call-recordings/$audioId"
)({
  validateSearch: AudioDetailsSchema,
  loader: async ({ params, context }) => {
    const audioData = await context.queryClient.ensureQueryData(
      getAudioDetailsFn(params.audioId, true)
    );
    return {
      ...audioData,
      crumb: audioData.audio?.client_audio_id || `Audio ${params.audioId}`,
    };
  },
  component: AudioDetails,
  pendingComponent: () => <RezolvLoader />,
});
```

**Reference:** [$audioId.tsx](file:///Users/drshnk/Developer/office/audit-panel/src/routes/_authenticated/automated-audits/call-recordings/$audioId.tsx)

### 4.5 Using Route in Components

```typescript
// Inside page component
import { Route } from "@/routes/_authenticated/automated-audits/call-recordings";

const AudioList = () => {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  // Navigate with search params
  navigate({
    to: `/automated-audits/call-recordings/${audioId}`,
    search: (prev) => ({
      ...prev,
      transcriptionId: data.transcription_id,
    }),
  });

  // Update pagination
  navigate({
    search: (prev) => ({ ...prev, page: page.toString() }),
  });
};
```

---

## 5. Forms with React Hook Form

### 5.1 Schema File

```typescript
// forms/CreateAuditForm/SingleUpload.schema.ts
import { z } from "zod";

export const singleUploadSchema = z.object({
  template_id: z.string().min(1, "Template is required"),
  file: z.instanceof(File, { message: "File is required" }),
});

export type SingleUploadSchema = z.infer<typeof singleUploadSchema>;
```

### 5.2 Form Component

```typescript
// forms/CreateAuditForm/SingleUpload.form.tsx
import { Button, useSheetContext } from "@tech-admin-getrezolv/ui-components";
import { Controller, useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type SingleUploadSchema,
  singleUploadSchema,
} from "./SingleUpload.schema";
import { useUploadAudioMutation } from "../../api/audios.mutations";

const SingleUploadForm = () => {
  const {
    control,
    formState: { errors },
    handleSubmit,
  } = useForm<SingleUploadSchema>({
    resolver: zodResolver(singleUploadSchema),
    defaultValues: {
      template_id: "",
      file: undefined,
    },
  });

  const queryClient = useQueryClient();
  const { close } = useSheetContext();
  const { isPending, ...createAudio } = useUploadAudioMutation();

  const handleFormSubmit = (data: SingleUploadSchema) => {
    createAudio.mutate(
      {
        fileName: data.file?.name,
        file: data.file,
        templateRefNumber: data.template_id,
        metaData: {},
      },
      {
        onSuccess: () => {
          close();
          queryClient.invalidateQueries({
            queryKey: ["automated-audit", "audios"],
            exact: false,
          });
        },
        onError: (error) => {
          console.error("Upload failed:", error);
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Controller
        control={control}
        name="template_id"
        render={({ field, fieldState }) => (
          <TemplateSelector
            setValue={field.onChange}
            value={field.value}
            error={!!fieldState.error}
            errorMessage={fieldState.error?.message || ""}
          />
        )}
      />
      <Controller
        name="file"
        control={control}
        render={({ field, fieldState }) => (
          <CustomFileUpload
            file={field.value}
            onFileChange={(file) => field.onChange(file)}
            error={!!fieldState.error}
            errorMessage={fieldState.error?.message || ""}
          />
        )}
      />
      <div className="flex gap-2">
        <Button intent="inverse" onClick={() => close()}>
          Cancel
        </Button>
        <Button type="submit" loading={isPending}>
          Save
        </Button>
      </div>
    </form>
  );
};
```

**Reference:** [SingleUpload.form.tsx](file:///Users/drshnk/Developer/office/audit-panel/src/features/automated-audit/Audios/forms/CreateAuditForm/SingleUpload.form.tsx)

---

## 6. Component Patterns

### 6.1 NSheet (Drawer/Sheet)

```typescript
// components/CreateAuditBtn/CreateAuditBtn.tsx
import { Button, Dropdown, NSheet } from "@tech-admin-getrezolv/ui-components";
import { Cross1Icon } from "@radix-ui/react-icons";

const CreateAuditBtn = () => {
  const [sheet, setSheet] = useState<SheetType | null>(null);

  return (
    <NSheet onOpenChange={(val) => !val && setSheet(null)}>
      <Dropdown>
        <Dropdown.Toggle>
          <Button intent="primary" prefix={<PlusIcon />}>
            Upload Call Recording
          </Button>
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <NSheet.Trigger>
            <Dropdown.Item onClick={() => setSheet(SheetType.SINGLE)}>
              Single Upload
            </Dropdown.Item>
          </NSheet.Trigger>
        </Dropdown.Menu>
      </Dropdown>
      <NSheet.Content>
        <NSheet.Header>
          <div className="flex justify-between">
            <NSheet.Title>Upload Call Recording</NSheet.Title>
            <NSheet.Close>
              <Cross1Icon className="cursor-pointer" />
            </NSheet.Close>
          </div>
        </NSheet.Header>
        {sheet === SheetType.SINGLE && <SingleUploadForm />}
      </NSheet.Content>
    </NSheet>
  );
};
```

**Reference:** [CreateAuditBtn.tsx](file:///Users/drshnk/Developer/office/audit-panel/src/features/automated-audit/Audios/components/CreateAuditBtn/CreateAuditBtn.tsx)

### 6.2 Component Organization

Components are organized in folders with their sub-components:

```
components/
├── CreateAuditBtn/
│   └── CreateAuditBtn.tsx
├── Filters/
│   ├── Filters.tsx                   # Main component
│   └── components/                   # Sub-components
│       ├── AgencyFilter.tsx
│       ├── AgentFilter.tsx
│       └── ...
└── SummaryCard/
    ├── SummaryCard.tsx
    └── components/
```

---

## 7. Page Components

### 7.1 Page Layout Structure

```typescript
// pages/AudioList.tsx
import { PageLayout } from "@/shared/components/page-layout/PageLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomTable, Pagination } from "@tech-admin-getrezolv/ui-components";
import { createColumnHelper } from "@tanstack/react-table";
import { Route } from "@/routes/_authenticated/automated-audits/call-recordings";

const AudioList = () => {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();

  const { data, isLoading, isError, isFetching } = useQuery(
    getAuditsListFn({
      page: search.page,
      options: {
        agency_ref_number: search.agency_ref_number,
        // ... other search params
      },
    })
  );

  const columnHelper = createColumnHelper<Audit & { action: string }>();
  const columns = [
    columnHelper.accessor("client_audio_id", {
      header: "Audio ID",
      cell: (info) => info.getValue() ?? "-",
    }),
    // ... more columns
  ];

  return (
    <PageLayout>
      <PageLayout.Body>
        <PageLayout.Header className="flex justify-between gap-2 items-center">
          <Filters />
          <CreateAuditBtn />
        </PageLayout.Header>
        <PageLayout.Content>
          <CustomTable
            columnProps={columns}
            dataProps={data?.audits ?? []}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            trOnClick={(data) => {
              navigate({
                to: `/automated-audits/call-recordings/${data.original.client_audio_id}`,
                search: (prev) => ({
                  ...prev,
                  transcriptionId: data.original.transcription_id,
                }),
              });
            }}
          />
        </PageLayout.Content>
        <PageLayout.Footer>
          <Pagination
            currentPage={Number(search.page)}
            totalPages={data?.total ?? 1}
            onPageChange={(page) => {
              navigate({
                search: (prev) => ({ ...prev, page: page.toString() }),
              });
            }}
          />
        </PageLayout.Footer>
      </PageLayout.Body>
    </PageLayout>
  );
};

export default AudioList;
```

**Reference:** [AudioList.tsx](file:///Users/drshnk/Developer/office/audit-panel/src/features/automated-audit/Audios/pages/AudioList.tsx)

### 7.2 Barrel Exports

```typescript
// features/automated-audit/Audios/index.ts
export { default as AudioList } from "./pages/AudioList";
```

---

## 8. Table Configurations

### 8.1 Table Config Pattern

For complex table configurations with multiple columns, extract the table configuration to a separate config file. This improves maintainability and keeps page components focused on logic.

**Reference:** [userList.table.ts](file:///Users/drshnk/Developer/office/panel-migration/tanstack-router/src/features/user-management/Users/config/userList.table.ts)

### 8.2 Config File Structure

```
src/features/user-management/Users/
├── config/
│   └── userList.table.ts             # Table column definitions and config
├── pages/
│   └── UserList.tsx                  # Page component using table config
└── ...
```

### 8.3 Naming Conventions

| Type      | Pattern                  | Example                  |
| --------- | ------------------------ | ------------------------ |
| Table Config | `[entityName].table.ts` | `userList.table.ts`      |
| Column Function | `create[EntityName]Columns` | `createUserListColumns` |
| Table Config | `[entityName]TableConfig` | `userListTableConfig` |

### 8.4 Table Config File

```typescript
// config/userList.table.ts
import { createColumnHelper } from "@tanstack/react-table";
import { checkDataEmpty, convertToTitleCase } from "@/utils/utils";
import type { ClientUsersList } from "../api/users.types";

export const createUserListColumns = (
  state: {
    setEditData: (data: any) => void;
    setActiveForm: (form: FormState | null) => void;
    // ... other state setters
  }
) => {
  const columnHelper = createColumnHelper<ClientUsersList & { actions?: string }>();

  return [
    columnHelper.accessor("first_name", {
      cell: (info) => {
        const res =
          info.getValue() === ""
            ? checkDataEmpty(info.getValue())
            : convertToTitleCase(
                `${info.getValue()} ${info.row.original.last_name}`
              );
        return <p style={{ margin: "0px", whiteSpace: "nowrap" }}>{res}</p>;
      },
      header: "Name",
    }),
    // ... more columns
  ];
};

export const userListTableConfig = {
  enableColumnPinning: true,
  defaultPinnedColumns: { right: ["actions"] },
  nonPinnableColumns: [
    "first_name",
    "client_user_ref_number",
    "created_by",
    "reporting_manager_name",
    "email",
    "client_user_role",
    "team_name",
    "client_user_visibility",
    "actions",
  ],
};
```

### 8.5 Using Table Config in Page Component

```typescript
// pages/UserList.tsx
import { createUserListColumns, userListTableConfig } from "../config/userList.table";

const UserList = () => {
  const { state, onChangeSwitch, goToFirstPage } = useUserListLogic(search, navigate);

  const columns = createUserListColumns({
    setEditData: state.setEditData,
    setActiveForm: state.setActiveForm,
    setIsDialogOpen: state.setIsDialogOpen,
    setPendingSwitchData: state.setPendingSwitchData,
    statusMutation: state.statusMutation,
    pendingSwitchData: state.pendingSwitchData,
  });

  return (
    <PageLayout>
      <PageLayout.Content>
        <CustomTable
          columnProps={columns}
          dataProps={state.usersList?.client_users ?? []}
          isLoading={state.isLoading}
          isFetching={state.isFetching}
          isError={state.isError}
          {...userListTableConfig}
        />
      </PageLayout.Content>
    </PageLayout>
  );
};
```

### 8.6 When to Use Table Config Files

**Use table config files when:**
- Tables have 5+ columns
- Columns have complex cell renderers
- Multiple pages share similar table structures
- Table configuration is reusable across features

**Keep table configuration inline when:**
- Tables have simple column definitions (≤3 columns)
- Tables are unique to a single page
- Cell renderers are trivial

### 8.7 Best Practices

1. **Separate concerns**: Column definitions go in config, page logic stays in page component
2. **Pass state as parameters**: Column functions receive necessary state as parameters
3. **Type safety**: Export types for table data and row actions
4. **Reusability**: Create reusable column builders for common patterns
5. **Avoid const assertions**: Don't use `as const` for config objects as it can cause type incompatibility with UI components that expect mutable arrays

---

## 9. Shared and UI Components

> [!IMPORTANT] > **Before creating any new component**, check if it already exists in the shared catalog or UI library.

### 9.1 Component Sources

There are two main sources for reusable components:

| Source                    | Import                                | Description                                                                         |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| **tech-admin UI Library** | `@tech-admin-getrezolv/ui-components` | Core UI primitives (Button, Input, Dropdown, NSheet, CustomTable, Pagination, etc.) |
| **Shared Components**     | `@/shared/components/`                | App-specific shared components (PageLayout, Filters, Loaders, etc.)                 |

### 9.2 tech-admin UI Components

Import core UI components from the shared library:

```typescript
import {
  Button,
  Input,
  Dropdown,
  NSheet,
  CustomTable,
  Pagination,
  useSheetContext,
} from "@tech-admin-getrezolv/ui-components";
```

### 9.3 Shared Components Catalog

> [!TIP] > **Always check** [shared-components/\_index.md](./shared-components/_index.md) **before creating any commonly used component** to see if it already exists.

Available shared components include:

| Component            | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `PageLayout`         | Page structure with Header/Body/Content/Footer |
| `RezolvLoader`       | Full-screen branded loader                     |
| `CustomLoader`       | Inline loading spinner                         |
| `CustomFileUpload`   | Drag-and-drop file upload                      |
| `Breadcrumbs`        | Route-based navigation breadcrumbs             |
| `DropdownWithFilter` | Searchable dropdown                            |
| `SentimentBadge`     | Positive/neutral/negative sentiment display    |
| `IndicatorBadge`     | Status indicator with label                    |

**Reference:** [shared-components/\_index.md](file:///Users/drshnk/Developer/office/audit-panel/docs/shared-components/_index.md)

### 9.4 Creating New Shared Components

> [!CAUTION]
> When you need to create a new shared component, you **MUST** follow [shared-folder-rules.md](./shared-folder-rules.md).

Key rules:

1. **Shared = Truly Reusable**: Only add items used by 2+ features
2. **No Circular Dependencies**: Shared items MUST NOT import from `src/features/`
3. **Folder structure**: `kebab-case` folder, `PascalCase` component file
4. **TypeScript Required**: All files must be `.ts` or `.tsx`

```
src/shared/components/
├── component-name/           # kebab-case folder name
│   ├── ComponentName.tsx     # PascalCase main component
│   ├── ComponentName.types.ts  # Optional: types if complex
│   └── index.ts              # Re-export main component
└── index.ts                  # Barrel export all components
```

**Reference:** [shared-folder-rules.md](file:///Users/drshnk/Developer/office/audit-panel/docs/shared-folder-rules.md)

### 9.5 Decision Flow

```
Need a component?
       │
       ▼
Is it in @tech-admin-getrezolv/ui-components?
       │
  Yes ─┼─ No
   │   │   ▼
   │   Check shared-components/_index.md
   │       │
   │  Yes ─┼─ No
   │   │   │   ▼
   │   │   Is it used by 2+ features?
   │   │       │
   │   │  Yes ─┼─ No
   │   │   │   │   ▼
   │   │   │   Create in feature's components/
   │   │   ▼
   │   │   Create in src/shared/
   │   │   (follow shared-folder-rules.md)
   │   ▼
   │   Use existing shared component
   ▼
   Use UI library component
```

---

## Quick Reference

| Pattern          | Location                                                    |
| ---------------- | ----------------------------------------------------------- |
| Query Factory    | `src/features/[parent]/api/queryFactory.ts`                 |
| Query Functions  | `src/features/[parent]/[Sub]/api/[sub].queries.ts`          |
| Mutations        | `src/features/[parent]/[Sub]/api/[sub].mutations.ts`        |
| Types            | `src/features/[parent]/[Sub]/api/[sub].types.ts`            |
| Form Schema      | `src/features/[parent]/[Sub]/forms/[Name]/[Name].schema.ts` |
| Form Component   | `src/features/[parent]/[Sub]/forms/[Name]/[Name].form.tsx`  |
| Page Component   | `src/features/[parent]/[Sub]/pages/[Name].tsx`              |
| Table Config     | `src/features/[parent]/[Sub]/config/[entity].table.ts`      |
| Route Definition | `src/routes/_authenticated/[path]/index.tsx`                |
| Shared Component | `src/shared/components/[name]/`                             |
| UI Component     | `@tech-admin-getrezolv/ui-components`                       |
