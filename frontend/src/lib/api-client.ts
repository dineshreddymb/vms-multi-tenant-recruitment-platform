const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface RequestOptions extends RequestInit {
  idempotencyKey?: string;
  skipAuth?: boolean;
}

export class APIError extends Error {
  status: number;
  detail: string;
  fieldErrors?: Record<string, string>;
  data?: any;

  constructor(status: number, detail: string, fieldErrors?: Record<string, string>, data?: any) {
    super(detail || `API error with status ${status}`);
    this.name = "APIError";
    this.status = status;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
    this.data = data;
  }
}

export const FIELD_LABELS: Record<string, string> = {
  pan: "PAN Card",
  contact_number: "Contact Number",
  email: "Email ID",
  current_company: "Current Company",
  total_experience: "Total Experience",
  relevant_experience: "Relevant Experience",
  notice_period: "Notice Period",
  ctc: "CTC",
  ectc: "ECTC",
  current_location: "Current Location",
  preferred_location: "Preferred Location",
  education: "Education",
  about: "About the Candidate",
  linkedin_url: "LinkedIn URL",
  role_id: "Target Job Role",
  cv_sent_date: "CV Sent Date",
  employment_mode: "Employment Mode",
  resume_id: "Resume",
  name: "Candidate Full Name",
  full_name: "Full Name",
  reason: "Reason",
  mobile: "Mobile Number",
  password: "Password",
  confirm_password: "Confirm Password"
};

export interface APIValidationError {
  type?: string;
  loc?: unknown[];
  msg?: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

function getFieldKey(loc: unknown[]): string | null {
  if (!Array.isArray(loc) || loc.length === 0) return null;
  let lastIndex = loc.length - 1;
  while (lastIndex >= 0 && typeof loc[lastIndex] === "number") {
    lastIndex--;
  }
  if (lastIndex >= 0) {
    const key = loc[lastIndex];
    if (typeof key === "string") {
      return key;
    }
  }
  return null;
}

function formatFieldKeyToLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function formatValidationErrorItem(item: APIValidationError): { fieldKey: string | null; message: string } {
  const loc = Array.isArray(item.loc) ? item.loc : [];
  const fieldKey = getFieldKey(loc);
  const fieldLabel = fieldKey ? (FIELD_LABELS[fieldKey] || formatFieldKeyToLabel(fieldKey)) : "";
  const ctx = (item.ctx && typeof item.ctx === "object") ? item.ctx : {};
  
  let cleanMsg = item.msg || "";
  if (cleanMsg.startsWith("Value error, ")) {
    cleanMsg = cleanMsg.replace(/^Value error,\s*/, "");
  }

  let text = "";
  const errType = item.type || "";
  
  if (errType === "missing") {
    text = "This field is required.";
  } else if (errType === "string_too_short") {
    const limit = ctx.min_length ?? ctx.limit ?? "";
    text = `Must contain at least ${limit} characters.`;
  } else if (errType === "string_too_long") {
    const limit = ctx.max_length ?? ctx.limit ?? "";
    text = `Must contain at most ${limit} characters.`;
  } else if (errType === "string_pattern_mismatch") {
    text = "Must match the required format.";
  } else if (errType === "int_parsing") {
    text = "Must be a valid integer.";
  } else if (errType === "float_parsing") {
    text = "Must be a valid decimal number.";
  } else if (errType === "greater_than") {
    const limit = ctx.gt ?? "";
    text = `Must be greater than ${limit}.`;
  } else if (errType === "greater_than_equal") {
    const limit = ctx.ge ?? "";
    text = `Must be greater than or equal to ${limit}.`;
  } else if (errType === "less_than") {
    const limit = ctx.lt ?? "";
    text = `Must be less than ${limit}.`;
  } else if (errType === "less_than_equal") {
    const limit = ctx.le ?? "";
    text = `Must be less than or equal to ${limit}.`;
  } else if (errType === "list_type") {
    text = "Must be a valid list.";
  } else if (errType === "dict_type") {
    text = "Must be a valid object.";
  } else {
    text = cleanMsg || "Invalid value.";
  }

  const fullMessage = fieldLabel ? `${fieldLabel}: ${text}` : text;
  return { fieldKey, message: fullMessage };
}

export function formatDetailError(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages: string[] = [];
    for (const item of detail) {
      if (item && typeof item === "object") {
        const itemVal = item as APIValidationError;
        const formatted = formatValidationErrorItem(itemVal);
        messages.push(formatted.message);
      }
    }
    if (messages.length > 0) {
      return messages.join("\n");
    }
  }

  if (detail && typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    for (const key of ["msg", "message", "error", "detail"]) {
      if (key in obj && typeof obj[key] === "string") {
        return obj[key] as string;
      }
    }
    try {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          parts.push(`${key}: ${value}`);
        }
      }
      if (parts.length > 0) {
        return parts.join(", ");
      }
    } catch {
      // ignore
    }
    return "An unexpected error occurred.";
  }

  return "";
}

function getCurrentStorageKeys(): { tokenKey: string; emailKey: string } {
  if (typeof window === "undefined") {
    return { tokenKey: "vms_vendor_access_token", emailKey: "vms_vendor_user_email" };
  }
  const path = window.location.pathname;
  if (path.includes("/recruiter") || path.includes("/auth/recruiter")) {
    return { tokenKey: "vms_recruiter_access_token", emailKey: "vms_recruiter_user_email" };
  }
  return { tokenKey: "vms_vendor_access_token", emailKey: "vms_vendor_user_email" };
}

class APIClient {
  private getAuthToken(): string | null {
    if (typeof window !== "undefined") {
      const { tokenKey } = getCurrentStorageKeys();
      return sessionStorage.getItem(tokenKey);
    }
    return null;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = `${DEFAULT_API_URL}${endpoint}`;
    
    // Build headers
    const headers = new Headers(options.headers || {});
    
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    // Attach auth token if not skipped
    if (!options.skipAuth) {
      const token = this.getAuthToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    // Automatically send X-Vendor-ID from sessionStorage for vendor requests
    if (typeof window !== "undefined" && !headers.has("X-Vendor-ID")) {
      const activeVendorId = sessionStorage.getItem("vms_active_vendor_id");
      if (activeVendorId) {
        headers.set("X-Vendor-ID", activeVendorId);
      }
    }

    // Attach idempotency key if provided
    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }

    const fetchOptions: RequestInit = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 session revocation
      if (response.status === 401) {
        if (typeof window !== "undefined") {
          if (!options.skipAuth) {
            const { tokenKey } = getCurrentStorageKeys();
            sessionStorage.removeItem(tokenKey);
            sessionStorage.removeItem("vms_access_token");
            // Dispatch a custom event to notify AuthContext to redirect
            window.dispatchEvent(new CustomEvent("vms-unauthorized"));
          }
        }
        const errorData = await response.json().catch(() => ({}));
        const rawDetail = errorData.detail;
        const parsedDetail = formatDetailError(rawDetail);
        throw new APIError(401, parsedDetail || "Session expired or invalid login.");
      }

      // Handle 403 Forbidden - Check specifically for Account Deactivated
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        const rawDetail = errorData.detail;
        const parsedDetail = formatDetailError(rawDetail);
        const isDeactivated = typeof parsedDetail === "string" && parsedDetail.toLowerCase().includes("deactivated");
        
        if (isDeactivated && typeof window !== "undefined") {
          const { tokenKey, emailKey } = getCurrentStorageKeys();
          sessionStorage.removeItem(tokenKey);
          sessionStorage.removeItem(emailKey);
          sessionStorage.removeItem("vms_access_token");
          sessionStorage.removeItem("vms_user_email");
          window.dispatchEvent(new CustomEvent("vms-account-deactivated"));
          if (window.location.pathname !== "/auth/account-deactivated") {
            window.location.href = "/auth/account-deactivated";
          }
        }
        throw new APIError(403, parsedDetail || "Access forbidden.");
      }

      // Handle other error responses
      if (!response.ok) {
        let detail = "";
        let fieldErrors: Record<string, string> | undefined = undefined;
        let errorData: any = null;
        try {
          errorData = await response.json();
          const rawDetail = errorData.detail;
          const parsedDetail = formatDetailError(rawDetail);
          detail = parsedDetail || `Request failed with status ${response.status}`;
          
          if (Array.isArray(rawDetail)) {
            fieldErrors = {};
            for (const item of rawDetail) {
              if (item && typeof item === "object") {
                const itemVal = item as APIValidationError;
                const formatted = formatValidationErrorItem(itemVal);
                if (formatted.fieldKey) {
                  fieldErrors[formatted.fieldKey] = formatted.message;
                }
              }
            }
          }
        } catch {
          detail = `Request failed with status ${response.status}`;
        }
        throw new APIError(response.status, detail, fieldErrors, errorData);
      }

      // Check if response is a binary/blob (XLSX export or PDF resume download)
      const contentType = response.headers.get("Content-Type");
      if (
        contentType &&
        (contentType.includes("spreadsheetml") ||
          contentType.includes("application/pdf") ||
          contentType.includes("application/octet-stream"))
      ) {
        return (await response.blob()) as unknown as T;
      }

      // Return JSON parsed data
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, error instanceof Error ? error.message : "Network error occurred.");
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const requestBody = body instanceof FormData ? body : JSON.stringify(body);
    return this.request<T>(endpoint, { ...options, method: "POST", body: requestBody });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const requestBody = body instanceof FormData ? body : JSON.stringify(body);
    return this.request<T>(endpoint, { ...options, method: "PATCH", body: requestBody });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

export const api = new APIClient();
