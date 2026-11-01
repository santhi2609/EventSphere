
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  MapPin,
  Package,
  Users,
  Handshake,
  ChartNoAxesColumn,
  Settings,
  Search,
  Bell,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  CalendarClock,
  Boxes,
  Download,
  RefreshCw,
  IndianRupee,
  ClipboardCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode, Html5QrcodeScanner } from "html5-qrcode";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5000/api"
    : "https://eventsphere-m3nd.onrender.com/api");

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Events", icon: CalendarDays },
  { label: "Venues", icon: MapPin },
  { label: "Resources", icon: Package },
  { label: "Attendees", icon: Users },
  { label: "Registrations", icon: ClipboardCheck },
  { label: "Vendors", icon: Handshake },
  { label: "Vendor Assignments", icon: ClipboardCheck },
  { label: "Reports", icon: ChartNoAxesColumn },
];

const configurations = {
  Events: {
    endpoint: "events",
    id: "event_id",
    title: "Event",
    fields: [
      { name: "name", label: "Event Name", required: true },
      {
        name: "type",
        label: "Event Type",
        required: true,
        options: ["Technical", "Cultural", "Conference", "Workshop", "Concert", "Corporate", "Seminar", "Other"],
      },
      { name: "date", label: "Event Date", type: "date", required: true },
      { name: "attendees", label: "Expected Attendees", type: "number" },
      { name: "budget", label: "Budget (₹)", type: "number" },
      {
        name: "status",
        label: "Status",
        required: true,
        options: ["Planned", "Active", "Completed", "Cancelled"],
      },
      { name: "venue_id", label: "Venue ID" },
      { name: "startTime", label: "Start Time", type: "time" },
      { name: "endTime", label: "End Time", type: "time" },
      { name: "description", label: "Description" },
    ],
  },
  Venues: {
    endpoint: "venues",
    id: "venue_id",
    title: "Venue",
    fields: [
      { name: "venue_name", label: "Venue Name", required: true },
      { name: "location", label: "Location", required: true },
      { name: "capacity", label: "Capacity", type: "number", required: true },
      { name: "rental_cost", label: "Rental Cost (₹/day)", type: "number", required: true },
    ],
  },
  Resources: {
    endpoint: "resources",
    id: "resource_id",
    title: "Resource",
    fields: [
      { name: "resource_name", label: "Resource Name", required: true },
      {
        name: "resource_type",
        label: "Category",
        required: true,
        options: ["Equipment", "Furniture", "Decoration", "Catering", "Other"],
      },
      { name: "quantity_available", label: "Quantity Available", type: "number", required: true },
      { name: "unit_cost", label: "Unit Cost (₹)", type: "number", required: true },
    ],
  },
  Attendees: {
    endpoint: "attendees",
    id: "attendee_id",
    title: "Attendee",
    fields: [
      { name: "full_name", label: "Full Name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel" },
    ],
  },
  Vendors: {
    endpoint: "vendors",
    id: "vendor_id",
    title: "Vendor",
    fields: [
      { name: "vendor_name", label: "Vendor Name", required: true },
      { name: "service_type", label: "Service Type", required: true },
      { name: "contact_email", label: "Contact Email", type: "email", required: true },
      { name: "contact_phone", label: "Contact Phone", type: "tel" },
    ],
  },
};

function formatDate(value) {
  if (!value) return "—";
  const date = String(value).slice(0, 10);
  const parts = date.split("-");
  if (parts.length !== 3) return "—";
  return `${parts[2]} ${new Date(`${date}T12:00:00`).toLocaleString("en", {
    month: "short",
  })} ${parts[0]}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function normalizeEvent(event) {
  return {
    ...event,
    id: event.event_id ?? event.id,
    name: event.event_name ?? event.name ?? "",
    type: event.event_type ?? event.type ?? "",
    date: String(
      event.formatted_start_date ||
        event.start_date ||
        event.booking_date ||
        event.date ||
        ""
    ).slice(0, 10),
    attendees:
      event.expected_attendees ?? event.attendees ?? 0,
    budget:
      event.planned_budget ?? event.budget ?? 0,
    status: event.status ?? "planned",
    venue_id: event.venue_id ? String(event.venue_id) : "",
    startTime: event.start_time || event.startTime || "09:00",
    endTime: event.end_time || event.endTime || "18:00",
  };
}

async function readResponse(response) {
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }

  return data;
}

function initialForm(page) {
  const config = configurations[page];
  if (!config) return {};

  return Object.fromEntries(
    config.fields.map((field) => [
      field.name,
      field.name === "status"
        ? "Planned"
        : field.name === "resource_type"
          ? "Equipment"
          : field.name === "startTime"
            ? "09:00"
            : field.name === "endTime"
              ? "18:00"
              : "",
    ])
  );
}

export default function App() {
  // Administrator authentication
  const [authToken, setAuthToken] = useState(
    localStorage.getItem("eventsphere_token") || ""
  );
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Attach the JWT to all protected API requests.
  const apiFetch = (url, options = {}) => {
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {}),
    },
  });
};

  // Verify a previously saved session when the app opens.
  useEffect(() => {
  async function verifySession() {
    if (!authToken) {
      setAuthUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await readResponse(response);
      setAuthUser(data.user);
    } catch (error) {
      localStorage.removeItem("eventsphere_token");
      setAuthToken("");
      setAuthUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  verifySession();
}, [authToken]);

  async function handleLogin(event) {
    event.preventDefault();
    try {
      setLoginLoading(true);
      setLoginError("");
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await readResponse(response);
      localStorage.setItem("eventsphere_token", data.token);
      setAuthToken(data.token);
      setAuthUser(data.user);
      setLoginPassword("");
    } catch (error) {
      setLoginError(error.message || "Unable to log in.");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("eventsphere_token");
    setAuthToken("");
    setAuthUser(null);
    setLoginEmail("");
    setLoginPassword("");
    setActivePage("Dashboard");
  }
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [resources, setResources] = useState([]);
  const [attendees, setAttendees] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [scannedRegistration, setScannedRegistration] = useState(null);
  const [scannerError, setScannerError] = useState("");
  const [qrImageLoading, setQrImageLoading] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationSaving, setRegistrationSaving] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [registrationNotice, setRegistrationNotice] = useState("");
  const [registrationForm, setRegistrationForm] = useState({
    full_name: "", email: "", phone: "", event_id: "", attendee_category: "general",
  });
  const [allocations, setAllocations] = useState([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [allocationError, setAllocationError] = useState("");
  const [allocationNotice, setAllocationNotice] = useState("");
  const [allocationEditing, setAllocationEditing] = useState(null);
  const [allocationForm, setAllocationForm] = useState({ event_id: "", resource_id: "", quantity_allocated: "1" });
  const [dashboardStats, setDashboardStats] = useState(null);

  const [reportSummary, setReportSummary] = useState(null);
  const [reportEvents, setReportEvents] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [activePage, setActivePage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [notice, setNotice] = useState("");
  
  const [vendorAssignments, setVendorAssignments] = useState([]);
const [vendorAssignmentsLoading, setVendorAssignmentsLoading] = useState(false);
const [vendorAssignmentSaving, setVendorAssignmentSaving] = useState(false);
const [vendorAssignmentError, setVendorAssignmentError] = useState("");
const [vendorAssignmentNotice, setVendorAssignmentNotice] = useState("");
const [vendorAssignmentEditing, setVendorAssignmentEditing] = useState(null);

const [vendorAssignmentForm, setVendorAssignmentForm] = useState({
  event_id: "",
  vendor_id: "",
  agreed_cost: "",
  service_status: "assigned",
});

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const datasets = {
    Events: events,
    Venues: venues,
    Resources: resources,
    Attendees: attendees,
    Vendors: vendors,
  };

  const setters = {
    Events: setEvents,
    Venues: setVenues,
    Resources: setResources,
    Attendees: setAttendees,
    Vendors: setVendors,
  };

  async function loadModule(moduleName) {
    const config = configurations[moduleName];
    if (!config) return;

    try {
      setLoading(true);
      setApiError("");

      const response = await apiFetch(`${API_URL}/${config.endpoint}`);
      const data = await readResponse(response);

      if (!Array.isArray(data)) {
        throw new Error(`${moduleName} API did not return a list.`);
      }

      setters[moduleName](
        moduleName === "Events" ? data.map(normalizeEvent) : data
      );
    } catch (error) {
      setApiError(error.message || `Unable to load ${moduleName}.`);
    } finally {
      setLoading(false);
    }
  }
  
  
async function loadVendorAssignments() {
  try {
    setVendorAssignmentsLoading(true);
    setVendorAssignmentError("");

    const response = await apiFetch(`${API_URL}/vendor-assignments`);
    const data = await readResponse(response);

    if (!Array.isArray(data)) {
      throw new Error("Vendor Assignments API did not return a list.");
    }

    setVendorAssignments(data);
  } catch (error) {
    setVendorAssignmentError(
      error.message || "Unable to load vendor assignments."
    );
  } finally {
    setVendorAssignmentsLoading(false);
  }
}

function resetVendorAssignmentForm() {
  setVendorAssignmentEditing(null);
  setVendorAssignmentForm({
    event_id: "",
    vendor_id: "",
    agreed_cost: "",
    service_status: "assigned",
  });
  setVendorAssignmentError("");
}

function editVendorAssignment(item) {
  setVendorAssignmentEditing({
    event_id: item.event_id,
    vendor_id: item.vendor_id,
  });

  setVendorAssignmentForm({
    event_id: String(item.event_id),
    vendor_id: String(item.vendor_id),
    agreed_cost: String(item.agreed_cost ?? ""),
    service_status: item.service_status || "assigned",
  });

  setVendorAssignmentError("");
  setVendorAssignmentNotice("");
}

async function saveVendorAssignment(event) {
  event.preventDefault();

  if (vendorAssignmentSaving) return;

  try {
    setVendorAssignmentSaving(true);
    setVendorAssignmentError("");
    setVendorAssignmentNotice("");

    const editing = vendorAssignmentEditing !== null;

    const url = editing
      ? `${API_URL}/vendor-assignments/${vendorAssignmentEditing.event_id}/${vendorAssignmentEditing.vendor_id}`
      : `${API_URL}/vendor-assignments`;

    const response = await apiFetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: Number(vendorAssignmentForm.event_id),
        vendor_id: Number(vendorAssignmentForm.vendor_id),
        agreed_cost: Number(vendorAssignmentForm.agreed_cost),
        service_status: vendorAssignmentForm.service_status,
      }),
    });

    await readResponse(response);

    resetVendorAssignmentForm();
    await loadVendorAssignments();

    setVendorAssignmentNotice(
      editing
        ? "Vendor assignment updated successfully."
        : "Vendor assigned to event successfully."
    );
  } catch (error) {
    setVendorAssignmentError(
      error.message || "Unable to save vendor assignment."
    );
  } finally {
    setVendorAssignmentSaving(false);
  }
}

async function deleteVendorAssignment(item) {
  if (
    !window.confirm(
      `Remove ${item.vendor_name} from ${item.event_name}?`
    )
  ) {
    return;
  }

  try {
    setVendorAssignmentError("");
    setVendorAssignmentNotice("");

    const response = await apiFetch(
      `${API_URL}/vendor-assignments/${item.event_id}/${item.vendor_id}`,
      { method: "DELETE" }
    );

    await readResponse(response);

    if (
      vendorAssignmentEditing?.event_id === item.event_id &&
      vendorAssignmentEditing?.vendor_id === item.vendor_id
    ) {
      resetVendorAssignmentForm();
    }

    await loadVendorAssignments();
    setVendorAssignmentNotice("Vendor assignment removed successfully.");
  } catch (error) {
    setVendorAssignmentError(
      error.message || "Unable to remove vendor assignment."
    );
  }
}

  async function loadAllocations() {
    try {
      setAllocationsLoading(true);
      setAllocationError("");
      const response = await apiFetch(`${API_URL}/resource-allocations`);
      const data = await readResponse(response);
      setAllocations(Array.isArray(data) ? data : []);
    } catch (error) {
      setAllocationError(error.message || "Unable to load resource allocations.");
    } finally {
      setAllocationsLoading(false);
    }
  }

  function resetAllocationForm() {
    setAllocationEditing(null);
    setAllocationForm({ event_id: "", resource_id: "", quantity_allocated: "1" });
    setAllocationError("");
  }

  async function saveAllocation(event) {
    event.preventDefault();
    if (allocationSaving) return;
    try {
      setAllocationSaving(true);
      setAllocationError("");
      setAllocationNotice("");
      const editing = allocationEditing !== null;
      const url = editing
        ? `${API_URL}/resource-allocations/${allocationEditing.event_id}/${allocationEditing.resource_id}`
        : `${API_URL}/resource-allocations`;
      const response = await apiFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: Number(allocationForm.event_id),
          resource_id: Number(allocationForm.resource_id),
          quantity_allocated: Number(allocationForm.quantity_allocated),
        }),
      });
      await readResponse(response);
      resetAllocationForm();
      await loadAllocations();
      setAllocationNotice(editing ? "Resource allocation updated successfully." : "Resource allocated successfully.");
    } catch (error) {
      setAllocationError(error.message || "Unable to save resource allocation.");
    } finally {
      setAllocationSaving(false);
    }
  }

  function editAllocation(item) {
    setAllocationEditing({ event_id: item.event_id, resource_id: item.resource_id });
    setAllocationForm({
      event_id: String(item.event_id),
      resource_id: String(item.resource_id),
      quantity_allocated: String(item.quantity_allocated),
    });
    setAllocationError("");
    setAllocationNotice("");
  }

  async function deleteAllocation(item) {
    if (!window.confirm(`Remove ${item.resource_name} from ${item.event_name}?`)) return;
    try {
      setAllocationError("");
      setAllocationNotice("");
      const response = await apiFetch(`${API_URL}/resource-allocations/${item.event_id}/${item.resource_id}`, { method: "DELETE" });
      await readResponse(response);
      if (allocationEditing?.event_id === item.event_id && allocationEditing?.resource_id === item.resource_id) resetAllocationForm();
      await loadAllocations();
      setAllocationNotice("Resource allocation removed successfully.");
    } catch (error) {
      setAllocationError(error.message || "Unable to remove allocation.");
    }
  }

  async function loadDashboardStats() {
    try {
      const response = await apiFetch(`${API_URL}/dashboard/stats`);
      setDashboardStats(await readResponse(response));
    } catch (error) {
      console.error("Dashboard statistics:", error.message);
    }
  }

  async function loadReports() {
    try {
      setReportsLoading(true);
      setApiError("");

      const [summaryResponse, eventsResponse] = await Promise.all([
        apiFetch(`${API_URL}/reports/summary`),
        apiFetch(`${API_URL}/reports/events`),
      ]);

      const [summary, rows] = await Promise.all([
        readResponse(summaryResponse),
        readResponse(eventsResponse),
      ]);

      if (!Array.isArray(rows)) {
        throw new Error("The event reports API did not return a list.");
      }

      setReportSummary(summary);
      setReportEvents(rows);
    } catch (error) {
      setApiError(error.message || "Unable to load reports.");
    } finally {
      setReportsLoading(false);
    }
  }

  // CSV EXPORT: keep this function inside App() so it can access reportEvents.
  function exportReportsCSV() {
    if (!reportEvents.length) {
      alert("No report data available to export.");
      return;
    }

    const headers = [
      "Event Name",
      "Event Date",
      "Planned Budget",
      "Sponsorship Revenue",
      "Total Expenses",
      "Remaining Budget",
      "Registrations",
      "Checked In",
    ];

    const rows = reportEvents.map((event) => {
      const budget = Number(event.planned_budget || 0);
      const expenses = Number(event.total_expenses || 0);

      return [
        event.event_name || "",
        event.start_date ? String(event.start_date).slice(0, 10) : "",
        budget,
        Number(event.sponsorship_revenue || 0),
        expenses,
        budget - expenses,
        Number(event.total_registrations || 0),
        Number(event.checked_in || 0),
      ];
    });

    const escapeCSV = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "eventsphere-event-reports.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function loadRegistrations() {
    try {
      setRegistrationLoading(true);
      setRegistrationError("");
      const response = await apiFetch(`${API_URL}/registrations`);
      const data = await readResponse(response);
      setRegistrations(Array.isArray(data) ? data : []);
    } catch (error) {
      setRegistrationError(error.message || "Unable to load registrations.");
    } finally {
      setRegistrationLoading(false);
    }
  }

  async function saveRegistration(event) {
    event.preventDefault();
    if (registrationSaving) return;
    try {
      setRegistrationSaving(true);
      setRegistrationError("");
      setRegistrationNotice("");
      const response = await apiFetch(`${API_URL}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...registrationForm, event_id: Number(registrationForm.event_id) }),
      });
      const result = await readResponse(response);
      setRegistrationNotice(`Registration successful! Ticket code: ${result.registration.ticket_code}`);
      setRegistrationForm({ full_name: "", email: "", phone: "", event_id: "", attendee_category: "general" });
      await loadRegistrations();
      await loadModule("Attendees");
    } catch (error) {
      setRegistrationError(error.message || "Unable to register attendee.");
    } finally {
      setRegistrationSaving(false);
    }
  }

  async function handleQrImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    let imageScanner;
    setQrImageLoading(true);
    setScannerError("");
    setRegistrationError("");
    setScannedRegistration(null);

    try {
      imageScanner = new Html5Qrcode("eventsphere-qr-file-reader");
      const decodedText = await imageScanner.scanFile(file, false);
      const scannedCode = String(decodedText || "").trim();

      const registration = registrations.find(
        (item) => String(item.ticket_code || "").trim() === scannedCode
      );

      if (registration) {
        setScannedRegistration(registration);
        setScannerError("");
      } else {
        setScannerError("QR code was read, but no registration matches this ticket code.");
      }
    } catch (error) {
      setScannerError("Could not read a QR code from this photo. Please choose a clear, uncropped PNG or JPG image.");
    } finally {
      if (imageScanner) {
        try { await imageScanner.clear(); } catch { /* Nothing to clear after file scanning. */ }
      }
      setQrImageLoading(false);
      event.target.value = "";
    }
  }

  async function updateRegistrationStatus(registration, action) {
    const actionLabel = action === "check-in" ? "check in this attendee" : "cancel this registration";
    if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) return;
    try {
      setRegistrationError("");
      setRegistrationNotice("");
      const response = await apiFetch(`${API_URL}/registrations/${registration.registration_id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await readResponse(response);
      setRegistrationNotice(result.message || "Registration updated.");
      await loadRegistrations();
      if (activePage === "Reports") await loadReports();
    } catch (error) {
      setRegistrationError(error.message || "Unable to update registration.");
    }
  }

  useEffect(() => {
    if (!authUser || !authToken) return;
    Object.keys(configurations).forEach(loadModule);
    loadDashboardStats();
    loadAllocations();
    loadRegistrations();
  }, [authUser, authToken]);

  // Start the camera QR scanner only while it is open on the Registrations page.
  useEffect(() => {
    if (!scannerOpen || activePage !== "Registrations") return undefined;

    let scanner;
    let handled = false;
    let timer;

    timer = window.setTimeout(() => {
      const container = document.getElementById("eventsphere-qr-reader");
      if (!container) return;

      try {
        scanner = new Html5QrcodeScanner(
          "eventsphere-qr-reader",
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false
        );

        scanner.render(
          (decodedText) => {
            if (handled) return;
            handled = true;

            const registration = registrations.find(
              (item) => String(item.ticket_code || "").trim() === String(decodedText || "").trim()
            );

            if (registration) {
              setScannedRegistration(registration);
              setScannerError("");
            } else {
              setScannedRegistration(null);
              setScannerError("No registration found for this ticket code.");
            }
            setScannerOpen(false);
          },
          () => {
            // The scanner emits frequent messages while searching; ignore them.
          }
        );
      } catch (error) {
        setScannerError(error.message || "Unable to start the QR scanner.");
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
      if (scanner) {
        scanner.clear().catch(() => {});
      }
    };
  }, [scannerOpen, activePage, registrations]);

  function navigateTo(label) {
    setActivePage(label);
    setNotice("");
    setApiError("");
    setSearch("");
    setPage(1);

    if (configurations[label]) loadModule(label);
    if (label === "Dashboard") {
      loadModule("Events");
      loadDashboardStats();
    }
    if (label === "Vendor Assignments") {
  loadVendorAssignments();
}
    if (label === "Reports") loadReports();
    if (label === "Registrations") loadRegistrations();
  }

  function openAdd() {
    setEditingId(null);
    setForm(initialForm(activePage));
    setModal(true);
    setNotice("");
    setApiError("");
  }

  function openEdit(item) {
    const config = configurations[activePage];
    const values = {};

    config.fields.forEach((field) => {
      const sourceName =
        activePage === "Events"
          ? ({
              name: item.name,
              type: item.type,
              date: item.date,
              attendees: item.attendees,
              budget: item.budget,
              status: item.status,
              description: item.description,
              venue_id: item.venue_id,
              startTime: item.startTime,
              endTime: item.endTime,
            }[field.name] ?? item[field.name])
          : item[field.name];

      values[field.name] = sourceName == null ? "" : String(sourceName);
    });

    setEditingId(item[config.id] ?? item.id);
    setForm(values);
    setModal(true);
    setNotice("");
    setApiError("");
  }

  async function saveItem(event) {
    event.preventDefault();
    if (saving) return;

    const config = configurations[activePage];
    const payload = { ...form };

    config.fields.forEach((field) => {
      if (field.type === "number") {
        payload[field.name] =
          form[field.name] === "" ? 0 : Number(form[field.name]);
      }
    });

    if (activePage === "Events") {
      payload.name = String(form.name || "").trim();
      payload.type = form.type;
      payload.date = form.date;
      payload.attendees = Number(form.attendees || 0);
      payload.budget = Number(form.budget || 0);
    }

    try {
      setSaving(true);
      setNotice("");
      setApiError("");

      const isEditing = editingId !== null;
      const response = await apiFetch(
        isEditing
          ? `${API_URL}/${config.endpoint}/${editingId}`
          : `${API_URL}/${config.endpoint}`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      await readResponse(response);
      setModal(false);
      setEditingId(null);

      await loadModule(activePage);
      await loadDashboardStats();

      if (activePage === "Reports") await loadReports();

      setNotice(
        `${config.title} ${isEditing ? "updated" : "added"} successfully!`
      );
    } catch (error) {
      setApiError(error.message || `Unable to save ${config.title.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item) {
    const config = configurations[activePage];
    const id = item[config.id] ?? item.id;

    if (!window.confirm(`Are you sure you want to delete this ${config.title.toLowerCase()}?`)) {
      return;
    }

    try {
      setApiError("");
      setNotice("");

      const response = await apiFetch(`${API_URL}/${config.endpoint}/${id}`, {
        method: "DELETE",
      });

      await readResponse(response);
      await loadModule(activePage);
      await loadDashboardStats();

      setNotice(`${config.title} deleted successfully!`);
    } catch (error) {
      setApiError(error.message || `Unable to delete ${config.title.toLowerCase()}.`);
    }
  }

  const filteredEvents = useMemo(() => {
    const term = search.toLowerCase().trim();
    return events.filter((event) =>
      `${event.name} ${event.type} ${event.status}`
        .toLowerCase()
        .includes(term)
    );
  }, [events, search]);

  const filteredAttendees = useMemo(() => {
    const term = search.toLowerCase().trim();
    return attendees.filter((item) =>
      `${item.full_name || ""} ${item.email || ""} ${item.phone || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [attendees, search]);

  const filteredVendors = useMemo(() => {
    const term = search.toLowerCase().trim();
    return vendors.filter((item) =>
      `${item.vendor_name || ""} ${item.service_type || ""} ${item.contact_email || ""} ${item.contact_phone || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [vendors, search]);

 const activeItems =
  activePage === "Dashboard" || activePage === "Events"
    ? events
    : datasets[activePage] || [];

const filteredItems =
  activePage === "Dashboard" || activePage === "Events"
    ? filteredEvents
    : activePage === "Attendees"
      ? filteredAttendees
      : activePage === "Vendors"
        ? filteredVendors
        : activeItems.filter((item) =>
            JSON.stringify(item)
              .toLowerCase()
              .includes(search.toLowerCase())
          );
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visibleItems = filteredItems.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const upcomingCount = events.filter(
    (event) => event.date && event.date >= today
  ).length;

  const stats = [
    {
      label: "Total Events",
      value: dashboardStats?.totalEvents ?? events.length,
      icon: CalendarCheck,
      tone: "blue",
    },
    {
      label: "Upcoming Events",
      value: dashboardStats?.upcomingEvents ?? upcomingCount,
      icon: CalendarClock,
      tone: "green",
    },
    {
      label: "Available Venues",
      value: dashboardStats?.availableVenues ?? venues.length,
      icon: MapPin,
      tone: "purple",
    },
    {
      label: "Resources",
      value: dashboardStats?.totalResources ?? resources.length,
      icon: Boxes,
      tone: "orange",
    },
  ];

  function columnsFor(moduleName) {
    switch (moduleName) {
      case "Events":
        return [
          ["name", "Event Name"],
          ["type", "Type"],
          ["date", "Date"],
          ["attendees", "Expected Attendees"],
          ["budget", "Budget (₹)"],
          ["status", "Status"],
        ];
      case "Venues":
        return [
          ["venue_name", "Venue Name"],
          ["location", "Location"],
          ["capacity", "Capacity"],
          ["rental_cost", "Rental Cost (₹/day)"],
        ];
      case "Resources":
        return [
          ["resource_name", "Resource Name"],
          ["resource_type", "Category"],
          ["quantity_available", "Quantity Available"],
          ["unit_cost", "Unit Cost (₹)"],
        ];
      case "Attendees":
        return [
          ["full_name", "Full Name"],
          ["email", "Email"],
          ["phone", "Phone"],
        ];
      case "Vendors":
        return [
          ["vendor_name", "Vendor Name"],
          ["service_type", "Service Type"],
          ["contact_email", "Email"],
          ["contact_phone", "Phone"],
        ];
      default:
        return [];
    }
  }

  function displayCell(moduleName, field, item) {
    const value = item[field];

    if (moduleName === "Events" && field === "date") {
      return formatDate(value);
    }

    if (
      ["budget", "rental_cost", "unit_cost"].includes(field)
    ) {
      return value === "" || value == null ? "—" : formatMoney(value);
    }

    if (value == null || value === "") return "—";
    return String(value);
  }

  const showEvents =
    activePage === "Dashboard" || activePage === "Events";

  if (authLoading) {
    return (
      <div className="login-screen">
        <h2>EventSphere</h2>
        <p>Verifying administrator session...</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand-icon"><CalendarDays size={26} /></div>
          <h1>EventSphere</h1>
          <p>Administrator Login</p>
          {loginError && <div className="notice" role="alert">{loginError}</div>}
          <label>
            Email Address
            <input type="email" value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="Enter administrator email" required />
          </label>
          <label>
            Password
            <input type={showPassword ? "text" : "password"}
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Enter your password" required />
          </label>
          <label className="login-show-password">
            <input type="checkbox" checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)} />
            Show password
          </label>
          <button type="submit" className="primary-button" disabled={loginLoading}>
            {loginLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <CalendarDays size={22} />
          </div>
          <span>EventSphere</span>
        </div>

        <nav className="side-nav">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-link ${activePage === label ? "selected" : ""}`}
              onClick={() => navigateTo(label)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button
          className={`nav-link settings-link ${activePage === "Settings" ? "selected" : ""}`}
          onClick={() => navigateTo("Settings")}
        >
          <Settings size={17} />
          <span>Settings</span>
        </button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="search-box">
            <Search size={16} />
            <input
              aria-label={`Search ${activePage.toLowerCase()}`}
              placeholder={`Search ${activePage.toLowerCase()}...`}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            {search && (
              <button
                className="clear-search"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="profile-area">
            <button className="notification-button" aria-label="Notifications">
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            <div className="avatar">
              {(authUser.name || "A").charAt(0).toUpperCase()}
            </div>
            <span className="admin-label">{authUser.name || "Admin"}</span>
            <button type="button" className="secondary-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <h1>
                {activePage === "Dashboard" ? "Event Management" : activePage}
              </h1>
              <p>
                {activePage === "Dashboard"
                  ? "Create, view and manage your events efficiently."
                  : `Manage your ${activePage.toLowerCase()} efficiently.`}
              </p>
            </div>
          </div>

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )}

          {apiError && (
            <div className="notice" role="alert">
              <span>{apiError}</span>
              <button
                onClick={() => {
                  if (configurations[activePage]) loadModule(activePage);
                  else if (activePage === "Reports") loadReports();
                  else loadDashboardStats();
                }}
              >
                Retry
              </button>
            </div>
          )}

          {activePage === "Dashboard" && (
            <section className="stats-grid">
              {stats.map(({ label, value, icon: Icon, tone }) => (
                <div className={`stat-card ${tone}`} key={label}>
                  <div className="stat-icon">
                    <Icon size={22} />
                  </div>
                  <div>
                    <p>{label}</p>
                    <strong>{value}</strong>
                  </div>
                </div>
              ))}
            </section>
          )}

          {showEvents && (
            <section className="events-panel">
              <div className="panel-heading">
                <h2>{activePage === "Dashboard" ? "All Events" : "Events Management"}</h2>
                <button
                  className="primary-button"
                  onClick={() => {
  setActivePage("Events");
  setSearch("");
  setPage(1);
  setEditingId(null);
  setForm(initialForm("Events"));
  setModal(true);
  setNotice("");
  setApiError("");
}}
                >
                  <Plus size={16} />
                  Add Event
                </button>
              </div>

              {loading && <p className="empty-state">Loading events from PostgreSQL...</p>}

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {columnsFor("Events").map(([field, label]) => (
                        <th key={field}>{label}</th>
                      ))}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading &&
                      visibleItems.map((item, index) => (
                        <tr key={item.event_id ?? item.id}>
                          <td>{(page - 1) * pageSize + index + 1}</td>
                          {columnsFor("Events").map(([field]) => (
                            <td key={field}>
                              {field === "name" ? (
                                <span className="event-name">{displayCell("Events", field, item)}</span>
                              ) : field === "status" ? (
                                <span className={`status-badge ${String(item.status || "planned").toLowerCase()}`}>
                                  {displayCell("Events", field, item)}
                                </span>
                              ) : (
                                displayCell("Events", field, item)
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="action-buttons">
                              <button className="edit-button" onClick={() => openEdit(item)} aria-label="Edit event">
                                <Pencil size={14} />
                              </button>
                              <button className="delete-button" onClick={() => deleteItem(item)} aria-label="Delete event">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {!loading && visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={columnsFor("Events").length + 2} className="empty-state">
                          No events found. Add an event or try another search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>
                  Showing {filteredItems.length ? (page - 1) * pageSize + 1 : 0} to{" "}
                  {Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length} events
                </span>
                <div className="pagination">
                  <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
                    <ChevronLeft size={16} />
                  </button>
                  <span>{page} / {pageCount}</span>
                  <button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {configurations[activePage] && activePage !== "Events" && (
            <section className="events-panel">
              <div className="panel-heading">
                <div>
                  <h2>{activePage} Management</h2>
                  <p>Manage and view your {activePage.toLowerCase()}.</p>
                </div>
                <button className="primary-button" onClick={openAdd}>
                  <Plus size={16} />
                  Add {configurations[activePage].title}
                </button>
              </div>

              {loading && <p className="empty-state">Loading {activePage.toLowerCase()}...</p>}

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {columnsFor(activePage).map(([field, label]) => (
                        <th key={field}>{label}</th>
                      ))}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading &&
                      visibleItems.map((item, index) => (
                        <tr key={item[configurations[activePage].id] ?? index}>
                          <td>{(page - 1) * pageSize + index + 1}</td>
                          {columnsFor(activePage).map(([field]) => (
                            <td key={field}>
                              {field === columnsFor(activePage)[0][0] ? (
                                <span className="event-name">{displayCell(activePage, field, item)}</span>
                              ) : (
                                displayCell(activePage, field, item)
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="action-buttons">
                              <button className="edit-button" onClick={() => openEdit(item)} aria-label={`Edit ${configurations[activePage].title}`}>
                                <Pencil size={14} />
                              </button>
                              <button className="delete-button" onClick={() => deleteItem(item)} aria-label={`Delete ${configurations[activePage].title}`}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {!loading && visibleItems.length === 0 && (
                      <tr>
                        <td colSpan={columnsFor(activePage).length + 2} className="empty-state">
                          No records found. Click Add to create one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>Showing {filteredItems.length} of {activeItems.length} records</span>
                <div className="pagination">
                  <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
                    <ChevronLeft size={16} />
                  </button>
                  <span>{page} / {pageCount}</span>
                  <button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page >= pageCount}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {activePage === "Resources" && (
            <section className="events-panel" style={{ marginTop: 24 }}>
              <div className="panel-heading">
                <div>
                  <h2>Resource Allocation</h2>
                  <p>Assign resources to events and keep total allocations within available stock.</p>
                </div>
                <button className="secondary-button" type="button" onClick={loadAllocations}>
                  <RefreshCw size={15} /> Refresh allocations
                </button>
              </div>

              {allocationNotice && <div className="notice" role="status"><span>{allocationNotice}</span><button onClick={() => setAllocationNotice("")} aria-label="Dismiss"> <X size={15} /> </button></div>}
              {allocationError && <div className="notice" role="alert"><span>{allocationError}</span><button onClick={() => setAllocationError("")} aria-label="Dismiss"><X size={15} /></button></div>}

              <form onSubmit={saveAllocation} className="form-grid" style={{ padding: "16px 0", alignItems: "end" }}>
                <label>
                  Event *
                  <select required value={allocationForm.event_id} disabled={allocationEditing !== null} onChange={(event) => setAllocationForm({ ...allocationForm, event_id: event.target.value })}>
                    <option value="">Select event</option>
                    {events.map((item) => <option key={item.event_id ?? item.id} value={item.event_id ?? item.id}>{item.name || item.event_name}</option>)}
                  </select>
                </label>
                <label>
                  Resource *
                  <select required value={allocationForm.resource_id} disabled={allocationEditing !== null} onChange={(event) => setAllocationForm({ ...allocationForm, resource_id: event.target.value })}>
                    <option value="">Select resource</option>
                    {resources.map((item) => <option key={item.resource_id} value={item.resource_id}>{item.resource_name} — available: {item.quantity_available}</option>)}
                  </select>
                </label>
                <label>
                  Quantity to allocate *
                  <input type="number" min="1" step="1" required value={allocationForm.quantity_allocated} onChange={(event) => setAllocationForm({ ...allocationForm, quantity_allocated: event.target.value })} />
                </label>
                <div className="modal-actions" style={{ padding: 0, justifyContent: "flex-start" }}>
                  <button className="primary-button" type="submit" disabled={allocationSaving}>{allocationSaving ? "Saving..." : allocationEditing ? "Update Allocation" : "Assign Resource"}</button>
                  {allocationEditing && <button className="secondary-button" type="button" onClick={resetAllocationForm} disabled={allocationSaving}>Cancel Edit</button>}
                </div>
              </form>

              <div className="table-scroll">
                <table>
                  <thead><tr><th>#</th><th>Event</th><th>Resource</th><th>Category</th><th>Quantity Allocated</th><th>Unit Cost (₹)</th><th>Actions</th></tr></thead>
                  <tbody>
                    {!allocationsLoading && allocations.map((item, index) => (
                      <tr key={`${item.event_id}-${item.resource_id}`}>
                        <td>{index + 1}</td><td><span className="event-name">{item.event_name}</span></td><td>{item.resource_name}</td><td>{item.resource_type}</td><td>{item.quantity_allocated}</td><td>{formatMoney(item.unit_cost)}</td>
                        <td><div className="action-buttons"><button type="button" className="edit-button" aria-label="Edit allocation" onClick={() => editAllocation(item)}><Pencil size={14} /></button><button type="button" className="delete-button" aria-label="Remove allocation" onClick={() => deleteAllocation(item)}><Trash2 size={14} /></button></div></td>
                      </tr>
                    ))}
                    {allocationsLoading && <tr><td colSpan="7" className="empty-state">Loading allocations...</td></tr>}
                    {!allocationsLoading && allocations.length === 0 && <tr><td colSpan="7" className="empty-state">No resources assigned yet. Use the form above to assign a resource to an event.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="table-footer"><span>Showing {allocations.length} allocation{allocations.length === 1 ? "" : "s"}</span></div>
            </section>
          )}

          {activePage === "Registrations" && (
            <section className="events-panel">
              <div className="panel-heading">
                <div>
                  <h2>Attendee Registration</h2>
                  <p>Register an attendee for an event and generate a unique ticket code.</p>
                </div>
                <button className="secondary-button" type="button" onClick={loadRegistrations} disabled={registrationLoading}>
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>

              <div style={{ margin: "16px 0" }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setScannerError("");
                    setScannedRegistration(null);
                    setScannerOpen((open) => !open);
                  }}
                >
                  {scannerOpen ? "Close QR Scanner" : "Scan Ticket QR"}
                </button>

                <div style={{ marginTop: 16, marginBottom: 16 }}>
                  <label htmlFor="eventsphere-qr-image-upload" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
                    Or upload a QR code photo
                  </label>
                  <input
                    id="eventsphere-qr-image-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/*"
                    onChange={handleQrImageUpload}
                    disabled={qrImageLoading}
                  />
                  {qrImageLoading && <p role="status">Reading QR code from photo...</p>}
                  <div id="eventsphere-qr-file-reader" style={{ display: "none" }} />
                </div>

                {scannerOpen && (
                  <div style={{ maxWidth: 500, marginTop: 16 }}>
                    <p>Allow camera access and position the attendee's ticket QR code inside the scanning box.</p>
                    <div id="eventsphere-qr-reader" />
                  </div>
                )}

                {scannerError && (
                  <div className="notice" role="alert" style={{ marginTop: 12 }}>
                    <span>{scannerError}</span>
                    <button type="button" onClick={() => setScannerError("")} aria-label="Dismiss scanner error"><X size={15} /></button>
                  </div>
                )}

                {scannedRegistration && (
                  <div className="notice" role="status" style={{ marginTop: 12 }}>
                    <div>
                      <strong>Ticket found!</strong>
                      <p>Attendee: {scannedRegistration.full_name}</p>
                      <p>Event: {scannedRegistration.event_name}</p>
                      <p>Status: {scannedRegistration.registration_status}</p>
                      <p>Attendance: {scannedRegistration.checked_in ? "Already checked in" : "Not checked in"}</p>
                      {scannedRegistration.registration_status === "active" && !scannedRegistration.checked_in && (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => updateRegistrationStatus(scannedRegistration, "check-in")}
                        >
                          Confirm Check-In
                        </button>
                      )}
                    </div>
                    <button type="button" className="secondary-button" onClick={() => setScannedRegistration(null)}>Clear Result</button>
                  </div>
                )}
              </div>

              {registrationNotice && <div className="notice" role="status"><span>{registrationNotice}</span><button type="button" onClick={() => setRegistrationNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
              {registrationError && <div className="notice" role="alert"><span>{registrationError}</span><button type="button" onClick={() => setRegistrationError("")} aria-label="Dismiss"><X size={15} /></button></div>}

              <form onSubmit={saveRegistration} className="form-grid" style={{ padding: "16px 0", alignItems: "end" }}>
                <label>Full name *<input required maxLength="120" value={registrationForm.full_name} onChange={(event) => setRegistrationForm({ ...registrationForm, full_name: event.target.value })} /></label>
                <label>Email *<input required type="email" value={registrationForm.email} onChange={(event) => setRegistrationForm({ ...registrationForm, email: event.target.value })} /></label>
                <label>Phone *<input required type="tel" value={registrationForm.phone} onChange={(event) => setRegistrationForm({ ...registrationForm, phone: event.target.value })} /></label>
                <label>Event *<select required value={registrationForm.event_id} onChange={(event) => setRegistrationForm({ ...registrationForm, event_id: event.target.value })}><option value="">Select event</option>{events.map((item) => <option key={item.event_id ?? item.id} value={item.event_id ?? item.id}>{item.name || item.event_name}</option>)}</select></label>
                <label>Attendee category *<select required value={registrationForm.attendee_category} onChange={(event) => setRegistrationForm({ ...registrationForm, attendee_category: event.target.value })}><option value="general">General</option><option value="vip">VIP</option><option value="guest">Guest</option><option value="speaker">Speaker</option><option value="sponsor">Sponsor</option><option value="volunteer">Volunteer</option></select></label>
                <div className="modal-actions" style={{ padding: 0, justifyContent: "flex-start" }}><button className="primary-button" type="submit" disabled={registrationSaving || events.length === 0}>{registrationSaving ? "Registering..." : "Register Attendee"}</button></div>
              </form>

              <div className="stats-grid" style={{ margin: "12px 0 20px" }}>
                <div className="stat-card blue"><div><p>Active Registrations</p><strong>{registrations.filter((item) => item.registration_status === "active").length}</strong></div></div>
                <div className="stat-card green"><div><p>Present</p><strong>{registrations.filter((item) => item.registration_status === "active" && item.checked_in).length}</strong></div></div>
                <div className="stat-card orange"><div><p>Absent</p><strong>{registrations.filter((item) => item.registration_status === "active" && !item.checked_in).length}</strong></div></div>
                <div className="stat-card purple"><div><p>Cancelled</p><strong>{registrations.filter((item) => item.registration_status === "cancelled").length}</strong></div></div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead><tr><th>#</th><th>Attendee</th><th>Email</th><th>Event</th><th>Category</th><th>Ticket Code / QR</th><th>Status</th><th>Attendance</th><th>Actions</th></tr></thead>
                  <tbody>
                    {!registrationLoading && registrations.map((item, index) => (
                      <tr key={item.registration_id}>
                        <td>{index + 1}</td><td><span className="event-name">{item.full_name}</span></td><td>{item.email}</td><td>{item.event_name}</td><td>{item.attendee_category}</td>
                        <td><span title={item.ticket_code}>{String(item.ticket_code || "—").slice(0, 12)}{item.ticket_code?.length > 12 ? "…" : ""}</span>{item.ticket_code && <div style={{ marginTop: 6 }}><QRCodeSVG value={item.ticket_code} size={72} level="M" includeMargin /><div><button type="button" className="secondary-button" onClick={() => setSelectedTicket(item)}>Print ticket</button></div></div>}</td>
                        <td><span className={`status-badge ${item.registration_status}`}>{item.registration_status}</span></td><td>{item.checked_in ? "Checked in" : "Not checked in"}</td>
                        <td><div className="action-buttons">{item.registration_status === "active" && !item.checked_in && <button type="button" className="primary-button" onClick={() => updateRegistrationStatus(item, "check-in")}>Check in</button>}{item.registration_status === "active" && <button type="button" className="delete-button" onClick={() => updateRegistrationStatus(item, "cancel")} aria-label="Cancel registration"><X size={14} /> Cancel</button>}</div></td>
                      </tr>
                    ))}
                    {registrationLoading && <tr><td colSpan="9" className="empty-state">Loading registrations...</td></tr>}
                    {!registrationLoading && registrations.length === 0 && <tr><td colSpan="9" className="empty-state">No registrations yet. Use the form above to register the first attendee.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="table-footer"><span>{registrations.length} registration{registrations.length === 1 ? "" : "s"} total</span></div>
            </section>
          )}
          
          
{activePage === "Vendor Assignments" && (
  <section className="events-panel">
    <div className="panel-heading">
      <div>
        <h2>Vendor Assignments Management</h2>
        <p>Assign vendors to events and manage their service costs.</p>
      </div>

      <button
        className="secondary-button"
        type="button"
        onClick={loadVendorAssignments}
        disabled={vendorAssignmentsLoading}
      >
        <RefreshCw size={15} />
        Refresh
      </button>
    </div>

    {vendorAssignmentNotice && (
      <div className="notice" role="status">
        <span>{vendorAssignmentNotice}</span>
        <button
          type="button"
          onClick={() => setVendorAssignmentNotice("")}
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>
      </div>
    )}

    {vendorAssignmentError && (
      <div className="notice" role="alert">
        <span>{vendorAssignmentError}</span>
        <button
          type="button"
          onClick={() => setVendorAssignmentError("")}
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>
      </div>
    )}

    <form
      onSubmit={saveVendorAssignment}
      className="form-grid"
      style={{ padding: "16px 0", alignItems: "end" }}
    >
      <label>
        Event *
        <select
          required
          value={vendorAssignmentForm.event_id}
          disabled={vendorAssignmentEditing !== null}
          onChange={(event) =>
            setVendorAssignmentForm({
              ...vendorAssignmentForm,
              event_id: event.target.value,
            })
          }
        >
          <option value="">Select event</option>
          {events.map((item) => (
            <option
              key={item.event_id ?? item.id}
              value={item.event_id ?? item.id}
            >
              {item.name || item.event_name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Vendor *
        <select
          required
          value={vendorAssignmentForm.vendor_id}
          disabled={vendorAssignmentEditing !== null}
          onChange={(event) =>
            setVendorAssignmentForm({
              ...vendorAssignmentForm,
              vendor_id: event.target.value,
            })
          }
        >
          <option value="">Select vendor</option>
          {vendors.map((item) => (
            <option key={item.vendor_id} value={item.vendor_id}>
              {item.vendor_name} — {item.service_type}
            </option>
          ))}
        </select>
      </label>

      <label>
        Agreed Cost (₹) *
        <input
          type="number"
          min="0"
          step="0.01"
          required
          value={vendorAssignmentForm.agreed_cost}
          onChange={(event) =>
            setVendorAssignmentForm({
              ...vendorAssignmentForm,
              agreed_cost: event.target.value,
            })
          }
        />
      </label>

      <label>
        Service Status *
        <select
          required
          value={vendorAssignmentForm.service_status}
          onChange={(event) =>
            setVendorAssignmentForm({
              ...vendorAssignmentForm,
              service_status: event.target.value,
            })
          }
        >
          <option value="assigned">Assigned</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>

      <div
        className="modal-actions"
        style={{ padding: 0, justifyContent: "flex-start" }}
      >
        <button
          className="primary-button"
          type="submit"
          disabled={vendorAssignmentSaving}
        >
          {vendorAssignmentSaving
            ? "Saving..."
            : vendorAssignmentEditing
              ? "Update Assignment"
              : "Assign Vendor"}
        </button>

        {vendorAssignmentEditing && (
          <button
            className="secondary-button"
            type="button"
            onClick={resetVendorAssignmentForm}
            disabled={vendorAssignmentSaving}
          >
            Cancel Edit
          </button>
        )}
      </div>
    </form>

    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Event</th>
            <th>Vendor</th>
            <th>Service Type</th>
            <th>Agreed Cost (₹)</th>
            <th>Service Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {!vendorAssignmentsLoading &&
            vendorAssignments.map((item, index) => (
              <tr key={`${item.event_id}-${item.vendor_id}`}>
                <td>{index + 1}</td>
                <td>
                  <span className="event-name">
                    {item.event_name}
                  </span>
                </td>
                <td>{item.vendor_name}</td>
                <td>{item.service_type}</td>
                <td>{formatMoney(item.agreed_cost)}</td>
                <td>
                  <span
                    className={`status-badge ${String(
                      item.service_status || "assigned"
                    ).toLowerCase()}`}
                  >
                    {item.service_status || "assigned"}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      type="button"
                      className="edit-button"
                      aria-label="Edit vendor assignment"
                      onClick={() => editVendorAssignment(item)}
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      aria-label="Remove vendor assignment"
                      onClick={() => deleteVendorAssignment(item)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

          {vendorAssignmentsLoading && (
            <tr>
              <td colSpan="7" className="empty-state">
                Loading vendor assignments...
              </td>
            </tr>
          )}

          {!vendorAssignmentsLoading &&
            !vendorAssignmentError &&
            vendorAssignments.length === 0 && (
              <tr>
                <td colSpan="7" className="empty-state">
                  No vendor assignments found. Use the form above to
                  assign a vendor to an event.
                </td>
              </tr>
            )}
        </tbody>
      </table>
    </div>

    <div className="table-footer">
      <span>
        Showing {vendorAssignments.length} vendor assignment
        {vendorAssignments.length === 1 ? "" : "s"}
      </span>
    </div>
  </section>
)}

          {activePage === "Reports" && (
            <section className="reports-page">
              <div className="events-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Reports Overview</h2>
                    <p>Live financial and attendance insights from PostgreSQL.</p>
                  </div>
                  <div className="report-actions">
                    <button className="secondary-button" onClick={loadReports} disabled={reportsLoading}>
                      <RefreshCw size={15} />
                      Refresh
                    </button>
                    <button
                      className="primary-button"
                      onClick={exportReportsCSV}
                      disabled={reportsLoading || reportEvents.length === 0}
                    >
                      <Download size={15} />
                      Export CSV
                    </button>
                  </div>
                </div>

                {reportsLoading && <p className="empty-state">Loading reports from PostgreSQL...</p>}

                {!reportsLoading && reportSummary && (
                  <>
                    <div className="report-stats">
                      <div className="report-stat-card">
                        <span className="report-stat-icon blue"><CalendarDays size={20} /></span>
                        <p>Total Events</p>
                        <h3>{Number(reportSummary.total_events || 0)}</h3>
                        <small>Events in the database</small>
                      </div>
                      <div className="report-stat-card">
                        <span className="report-stat-icon green"><Users size={20} /></span>
                        <p>Total Attendees</p>
                        <h3>{Number(reportSummary.total_attendees || 0)}</h3>
                        <small>Attendee records</small>
                      </div>
                      <div className="report-stat-card">
                        <span className="report-stat-icon purple"><IndianRupee size={20} /></span>
                        <p>Planned Budget</p>
                        <h3>₹{formatMoney(reportSummary.planned_budget)}</h3>
                        <small>Combined planned budgets</small>
                      </div>
                      <div className="report-stat-card">
                        <span className="report-stat-icon orange"><ClipboardCheck size={20} /></span>
                        <p>Total Expenses</p>
                        <h3>₹{formatMoney(reportSummary.total_expenses)}</h3>
                        <small>Recorded expenses</small>
                      </div>
                    </div>

                    <div className="report-finance-grid">
                      <div className="report-card">
                        <h3>Budget Utilization</h3>
                        <p className="report-subtitle">Recorded expenses compared with the planned budget</p>
                        {(() => {
                          const budget = Number(reportSummary.planned_budget || 0);
                          const expenses = Number(reportSummary.total_expenses || 0);
                          const percent = budget > 0 ? (expenses / budget) * 100 : 0;
                          return (
                            <>
                              <div className="finance-numbers">
                                <span>Expenses</span>
                                <strong>₹{formatMoney(expenses)}</strong>
                              </div>
                              <div className="report-progress-track">
                                <div className="report-progress-fill" style={{ width: `${Math.min(percent, 100)}%` }} />
                              </div>
                              <div className="finance-numbers">
                                <span>{percent.toFixed(1)}% utilized</span>
                                <span>Budget: ₹{formatMoney(budget)}</span>
                              </div>
                              <div className="report-remaining">
                                <span>Budget remaining</span>
                                <strong>₹{formatMoney(budget - expenses)}</strong>
                              </div>
                              {expenses > budget && <p className="report-warning">Expenses exceed the planned budget.</p>}
                            </>
                          );
                        })()}
                      </div>

                      <div className="report-card">
                        <h3>Registration Overview</h3>
                        <p className="report-subtitle">Registration and event check-in statistics</p>
                        <div className="registration-metric">
                          <span>Total Registrations</span>
                          <strong>{Number(reportSummary.total_registrations || 0)}</strong>
                        </div>
                        <div className="registration-metric">
                          <span>Checked In</span>
                          <strong>{Number(reportSummary.checked_in || 0)}</strong>
                        </div>
                        <div className="registration-metric">
                          <span>Not Yet Checked In</span>
                          <strong>{Math.max(0, Number(reportSummary.total_registrations || 0) - Number(reportSummary.checked_in || 0))}</strong>
                        </div>
                        <div className="registration-metric">
                          <span>Sponsorship Revenue</span>
                          <strong>₹{formatMoney(reportSummary.sponsorship_revenue)}</strong>
                        </div>
                      </div>
                    </div>

                    {reportEvents.length > 0 && (
                      <div
                        className="report-charts-grid"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                          gap: "20px",
                          marginBottom: "22px",
                        }}
                      >
                        <div className="report-card" style={{ minWidth: 0 }}>
                          <h3>Budget vs Expenses</h3>
                          <p className="report-subtitle">Compare planned budgets with recorded expenses for each event.</p>
                          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", margin: "14px 0 18px", fontSize: "12px", color: "#64748b" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#6366f1", display: "inline-block" }} /> Planned budget
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#f59e0b", display: "inline-block" }} /> Expenses
                            </span>
                          </div>
                          {(() => {
                            const maxBudget = Math.max(
                              1,
                              ...reportEvents.map((event) => Number(event.planned_budget || 0)),
                              ...reportEvents.map((event) => Number(event.total_expenses || 0))
                            );
                            return (
                              <div style={{ display: "grid", gap: "18px" }}>
                                {reportEvents.map((event) => {
                                  const budget = Number(event.planned_budget || 0);
                                  const expenses = Number(event.total_expenses || 0);
                                  return (
                                    <div key={`finance-chart-${event.event_id}`}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginBottom: "7px" }}>
                                        <strong style={{ fontSize: "13px", color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={event.event_name}>
                                          {event.event_name || "Unnamed event"}
                                        </strong>
                                        <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap" }}>₹{formatMoney(budget)}</span>
                                      </div>
                                      <div style={{ display: "grid", gap: "6px" }}>
                                        <div style={{ height: "9px", background: "#eef2ff", borderRadius: "999px", overflow: "hidden" }}>
                                          <div title={`Planned budget: ₹${formatMoney(budget)}`} style={{ width: `${Math.max(0, Math.min(100, (budget / maxBudget) * 100))}%`, height: "100%", background: "#6366f1", borderRadius: "999px", transition: "width 0.3s ease" }} />
                                        </div>
                                        <div style={{ height: "9px", background: "#fff7ed", borderRadius: "999px", overflow: "hidden" }}>
                                          <div title={`Expenses: ₹${formatMoney(expenses)}`} style={{ width: `${Math.max(0, Math.min(100, (expenses / maxBudget) * 100))}%`, height: "100%", background: "#f59e0b", borderRadius: "999px", transition: "width 0.3s ease" }} />
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "5px", fontSize: "11px", color: "#64748b" }}>
                                        <span>Expenses: ₹{formatMoney(expenses)}</span>
                                        <span>{budget > 0 ? `${((expenses / budget) * 100).toFixed(1)}% used` : expenses > 0 ? "No budget set" : "0% used"}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        <div className="report-card" style={{ minWidth: 0 }}>
                          <h3>Registrations by Event</h3>
                          <p className="report-subtitle">View registrations and check-ins for each event.</p>
                          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", margin: "14px 0 18px", fontSize: "12px", color: "#64748b" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#0ea5e9", display: "inline-block" }} /> Registrations
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#10b981", display: "inline-block" }} /> Checked in
                            </span>
                          </div>
                          {(() => {
                            const maxRegistrations = Math.max(
                              1,
                              ...reportEvents.map((event) => Number(event.total_registrations || 0)),
                              ...reportEvents.map((event) => Number(event.checked_in || 0))
                            );
                            return (
                              <div style={{ display: "grid", gap: "18px" }}>
                                {reportEvents.map((event) => {
                                  const registrations = Number(event.total_registrations ?? 0);
                                  const checkedIn = Number(event.checked_in ?? 0);

                                  // Debug the values received by the Reports UI.
                                  console.log("EventSphere check-in calculation:", {
                                    event: event.event_name,
                                    total_registrations: event.total_registrations,
                                    checked_in: event.checked_in,
                                    registrations,
                                    checkedIn,
                                    rate: registrations > 0
                                      ? ((checkedIn / registrations) * 100).toFixed(1) + "%"
                                      : "No registrations",
                                  });

                                  return (
                                    <div key={`registration-chart-${event.event_id}`}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginBottom: "7px" }}>
                                        <strong style={{ fontSize: "13px", color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={event.event_name}>
                                          {event.event_name || "Unnamed event"}
                                        </strong>
                                        <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap" }}>{registrations} registered</span>
                                      </div>
                                      <div style={{ display: "grid", gap: "6px" }}>
                                        <div style={{ height: "9px", background: "#e0f2fe", borderRadius: "999px", overflow: "hidden" }}>
                                          <div title={`Registrations: ${registrations}`} style={{ width: `${Math.max(0, Math.min(100, (registrations / maxRegistrations) * 100))}%`, height: "100%", background: "#0ea5e9", borderRadius: "999px", transition: "width 0.3s ease" }} />
                                        </div>
                                        <div style={{ height: "9px", background: "#d1fae5", borderRadius: "999px", overflow: "hidden" }}>
                                          <div title={`Checked in: ${checkedIn}`} style={{ width: `${Math.max(0, Math.min(100, (checkedIn / maxRegistrations) * 100))}%`, height: "100%", background: "#10b981", borderRadius: "999px", transition: "width 0.3s ease" }} />
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "5px", fontSize: "11px", color: "#64748b" }}>
                                        <span>Checked in: {checkedIn}</span>
                                        <span>{registrations > 0 ? `${((checkedIn / registrations) * 100).toFixed(1)}% check-in rate` : "No registrations"}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="report-card report-table-card">
                      <div className="panel-heading">
                        <div>
                          <h3>Event-wise Financial Report</h3>
                          <p className="report-subtitle">Budget, expenses and registrations for each event</p>
                        </div>
                        <span className="report-count">{reportEvents.length} events</span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Event</th>
                              <th>Date</th>
                              <th>Planned Budget</th>
                              <th>Sponsorship</th>
                              <th>Expenses</th>
                              <th>Remaining</th>
                              <th>Registrations</th>
                              <th>Checked In</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportEvents.map((event) => {
                              const budget = Number(event.planned_budget || 0);
                              const expenses = Number(event.total_expenses || 0);
                              return (
                                <tr key={event.event_id}>
                                  <td className="event-name">{event.event_name || "—"}</td>
                                  <td>{formatDate(event.start_date)}</td>
                                  <td>₹{formatMoney(budget)}</td>
                                  <td>₹{formatMoney(event.sponsorship_revenue)}</td>
                                  <td>₹{formatMoney(expenses)}</td>
                                  <td>
                                    <span className={budget - expenses < 0 ? "report-negative" : "report-positive"}>
                                      ₹{formatMoney(budget - expenses)}
                                    </span>
                                  </td>
                                  <td>{Number(event.total_registrations || 0)}</td>
                                  <td>{Number(event.checked_in || 0)}</td>
                                </tr>
                              );
                            })}
                            {reportEvents.length === 0 && (
                              <tr>
                                <td colSpan="8" className="empty-state">No event records available for reporting.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {!reportsLoading && !reportSummary && !apiError && (
                  <p className="empty-state">No report data is available yet. Click Refresh to try again.</p>
                )}
              </div>
            </section>
          )}

          {activePage === "Settings" && (
            <section className="events-panel">
              <div className="panel-heading"><h2>Settings</h2></div>
              <p className="empty-state">EventSphere application settings.</p>
            </section>
          )}

          {activePage === "Dashboard" && (
            <section className="forms-grid">
              <div className="tip-card">
                <div className="tip-icon"><CalendarDays size={20} /></div>
                <h3>Plan your next event</h3>
                <p>Add an event to manage its schedule, attendees, budget and resources.</p>
                <button className="secondary-button" onClick={() => navigateTo("Events")}>
                  <Plus size={15} /> Create an event
                </button>
              </div>
              <div className="tip-card">
                <div className="tip-icon"><MapPin size={20} /></div>
                <h3>Manage your venues</h3>
                <p>View your venues and add their locations, capacities and rental costs.</p>
                <button className="secondary-button" onClick={() => navigateTo("Venues")}>
                  View venues
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {modal && configurations[activePage] && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setModal(false);
          }}
        >
          <div className="modal-card">
            <div className="modal-heading">
              <div>
                <h2>{editingId !== null ? `Edit ${configurations[activePage].title}` : `Add ${configurations[activePage].title}`}</h2>
                <p>Enter the details below.</p>
              </div>
              <button type="button" className="close-modal" onClick={() => !saving && setModal(false)} disabled={saving} aria-label="Close form">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveItem}>
              <div className="form-grid">
                {configurations[activePage].fields.map((field) => (
                  <label key={field.name} className={field.name === "description" ? "full-width" : ""}>
                    {field.label}{field.required ? " *" : ""}
                    {field.name === "venue_id" ? (
                      <select
                        value={form[field.name] ?? ""}
                        onChange={(event) =>
                          setForm({ ...form, [field.name]: event.target.value })
                        }
                      >
                        <option value="">Select a venue (optional)</option>
                        {venues.map((venue) => (
                          <option
                            key={venue.venue_id}
                            value={String(venue.venue_id)}
                          >
                            {venue.venue_name} — Capacity: {venue.capacity ?? "Not specified"}
                          </option>
                        ))}
                      </select>
                    ) : field.options ? (
                      <select
                        required={field.required}
                        value={form[field.name] ?? ""}
                        onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                      >
                        {field.name !== "status" && field.name !== "resource_type" && (
                          <option value="">Select {field.label.toLowerCase()}</option>
                        )}
                        {field.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.name === "description" ? (
                      <textarea
                        rows="3"
                        value={form[field.name] ?? ""}
                        onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                      />
                    ) : (
                      <input
                        type={field.type || "text"}
                        required={field.required}
                        min={field.type === "number" ? "0" : undefined}
                        step={field.type === "number" ? "any" : undefined}
                        value={form[field.name] ?? ""}
                        onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setModal(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Saving..." : editingId !== null ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    {selectedTicket && (
      <div className="ticket-print-overlay">
        <div className="ticket-print-card">
          <h1>EventSphere</h1>
          <h2>Event Admission Ticket</h2>
          <div className="ticket-qr">
            <QRCodeSVG
              value={String(selectedTicket.ticket_code || "")}
              size={220}
              level="M"
              includeMargin
            />
          </div>
          <div className="ticket-details">
            <p><strong>Attendee:</strong> {selectedTicket.full_name || "—"}</p>
            <p><strong>Event:</strong> {selectedTicket.event_name || "—"}</p>
            <p><strong>Email:</strong> {selectedTicket.email || "—"}</p>
            <p><strong>Phone:</strong> {selectedTicket.phone || "—"}</p>
            <p><strong>Category:</strong> {selectedTicket.attendee_category || "General"}</p>
            <p><strong>Ticket Code:</strong> {selectedTicket.ticket_code || "—"}</p>
            <p><strong>Status:</strong> {selectedTicket.registration_status || "—"}</p>
          </div>
          <p className="ticket-note">Please present this QR code at event entry.</p>
          <div className="ticket-print-actions no-print">
            <button type="button" className="primary-button" onClick={() => window.print()}>Print Ticket</button>
            <button type="button" className="secondary-button" onClick={() => setSelectedTicket(null)}>Close</button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
