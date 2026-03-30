/**
 * Entry Templates — Structured capture formats filled by voice
 *
 * Predefined templates with sections that the user fills by speaking.
 * When a template is active, voice input fills the next empty section
 * instead of being a freeform entry.
 *
 * Built-in templates:
 * - Standup (yesterday/today/blockers)
 * - Meeting Notes (attendees/agenda/decisions/action items)
 * - Bug Report (what happened/steps to reproduce/expected/actual)
 * - Quick Email Draft (to/subject/body)
 * - Project Update (progress/risks/next steps)
 *
 * Users can also create custom templates.
 *
 * Storage: ~/.config/WhisperWoof/whisperwoof-templates.json
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("../../helpers/debugLogger");

const TEMPLATES_FILE = path.join(app.getPath("userData"), "whisperwoof-templates.json");
const MAX_TEMPLATES = 50;

// --- Built-in templates ---

const BUILT_IN_TEMPLATES = [
  {
    id: "builtin-standup",
    name: "Daily Standup",
    description: "Yesterday / Today / Blockers format",
    icon: "calendar",
    sections: [
      { id: "yesterday", label: "Yesterday", prompt: "What did you work on yesterday?", required: true },
      { id: "today", label: "Today", prompt: "What are you working on today?", required: true },
      { id: "blockers", label: "Blockers", prompt: "Any blockers or issues?", required: false },
    ],
    outputFormat: "## Daily Standup\n\n**Yesterday:**\n{{yesterday}}\n\n**Today:**\n{{today}}\n\n**Blockers:**\n{{blockers}}",
    builtIn: true,
  },
  {
    id: "builtin-meeting",
    name: "Meeting Notes",
    description: "Attendees / Agenda / Decisions / Action Items",
    icon: "users",
    sections: [
      { id: "attendees", label: "Attendees", prompt: "Who attended?", required: false },
      { id: "agenda", label: "Agenda", prompt: "What was discussed?", required: true },
      { id: "decisions", label: "Decisions", prompt: "What was decided?", required: false },
      { id: "actions", label: "Action Items", prompt: "What are the next steps?", required: false },
    ],
    outputFormat: "## Meeting Notes\n\n**Attendees:** {{attendees}}\n\n**Discussion:**\n{{agenda}}\n\n**Decisions:**\n{{decisions}}\n\n**Action Items:**\n{{actions}}",
    builtIn: true,
  },
  {
    id: "builtin-bug",
    name: "Bug Report",
    description: "What / Steps / Expected / Actual",
    icon: "bug",
    sections: [
      { id: "summary", label: "Summary", prompt: "What's the bug?", required: true },
      { id: "steps", label: "Steps to Reproduce", prompt: "How do you trigger it?", required: true },
      { id: "expected", label: "Expected Behavior", prompt: "What should happen?", required: true },
      { id: "actual", label: "Actual Behavior", prompt: "What actually happens?", required: true },
    ],
    outputFormat: "## Bug Report\n\n**Summary:** {{summary}}\n\n**Steps to Reproduce:**\n{{steps}}\n\n**Expected:** {{expected}}\n\n**Actual:** {{actual}}",
    builtIn: true,
  },
  {
    id: "builtin-email",
    name: "Quick Email Draft",
    description: "To / Subject / Body",
    icon: "mail",
    sections: [
      { id: "to", label: "To", prompt: "Who is this email for?", required: true },
      { id: "subject", label: "Subject", prompt: "What's the subject?", required: true },
      { id: "body", label: "Body", prompt: "What do you want to say?", required: true },
    ],
    outputFormat: "To: {{to}}\nSubject: {{subject}}\n\n{{body}}",
    builtIn: true,
  },
  {
    id: "builtin-update",
    name: "Project Update",
    description: "Progress / Risks / Next Steps",
    icon: "trending-up",
    sections: [
      { id: "progress", label: "Progress", prompt: "What's been accomplished?", required: true },
      { id: "risks", label: "Risks", prompt: "Any risks or concerns?", required: false },
      { id: "next", label: "Next Steps", prompt: "What's coming next?", required: true },
    ],
    outputFormat: "## Project Update\n\n**Progress:**\n{{progress}}\n\n**Risks:**\n{{risks}}\n\n**Next Steps:**\n{{next}}",
    builtIn: true,
  },
];

// --- Storage ---

function loadCustomTemplates() {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      return JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf-8"));
    }
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to load templates", { error: err.message });
  }
  return [];
}

function saveCustomTemplates(templates) {
  try {
    const dir = path.dirname(TEMPLATES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), "utf-8");
  } catch (err) {
    debugLogger.warn("[WhisperWoof] Failed to save templates", { error: err.message });
  }
}

// --- CRUD ---

function getAllTemplates() {
  const custom = loadCustomTemplates();
  return [...BUILT_IN_TEMPLATES, ...custom];
}

function getTemplate(id) {
  return getAllTemplates().find((t) => t.id === id) || null;
}

function createTemplate(config) {
  if (!config.name || !config.name.trim()) {
    return { success: false, error: "Template name is required" };
  }
  if (!Array.isArray(config.sections) || config.sections.length === 0) {
    return { success: false, error: "At least one section is required" };
  }

  const custom = loadCustomTemplates();
  if (custom.length >= MAX_TEMPLATES) {
    return { success: false, error: `Maximum ${MAX_TEMPLATES} custom templates` };
  }

  const template = {
    id: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: config.name.trim(),
    description: (config.description || "").trim(),
    icon: config.icon || "file-text",
    sections: config.sections.map((s, i) => ({
      id: s.id || `section-${i}`,
      label: s.label || `Section ${i + 1}`,
      prompt: s.prompt || "",
      required: s.required !== false,
    })),
    outputFormat: config.outputFormat || config.sections.map((s) => `**${s.label || "Section"}:**\n{{${s.id || `section-${i}`}}}`).join("\n\n"),
    builtIn: false,
    createdAt: new Date().toISOString(),
  };

  custom.push(template);
  saveCustomTemplates(custom);

  return { success: true, template };
}

function deleteTemplate(id) {
  // Can't delete built-in templates
  if (id.startsWith("builtin-")) {
    return { success: false, error: "Cannot delete built-in templates" };
  }

  const custom = loadCustomTemplates();
  const filtered = custom.filter((t) => t.id !== id);
  if (filtered.length === custom.length) {
    return { success: false, error: "Template not found" };
  }
  saveCustomTemplates(filtered);
  return { success: true };
}

// --- Template rendering ---

/**
 * Render a template with filled section values.
 *
 * @param {string} templateId
 * @param {Record<string, string>} values — { sectionId: "spoken text" }
 * @returns {{ success: boolean, output?: string, error?: string }}
 */
function renderTemplate(templateId, values) {
  const template = getTemplate(templateId);
  if (!template) return { success: false, error: "Template not found" };

  // Check required sections
  for (const section of template.sections) {
    if (section.required && (!values[section.id] || !values[section.id].trim())) {
      return { success: false, error: `Required section "${section.label}" is empty` };
    }
  }

  // Render output format
  let output = template.outputFormat;
  for (const section of template.sections) {
    const value = (values[section.id] || "").trim() || "(none)";
    output = output.replace(new RegExp(`\\{\\{${section.id}\\}\\}`, "g"), value);
  }

  return { success: true, output };
}

/**
 * Get the next unfilled section in a template session.
 */
function getNextSection(templateId, filledSections) {
  const template = getTemplate(templateId);
  if (!template) return null;

  const filled = new Set(Object.keys(filledSections || {}));
  return template.sections.find((s) => !filled.has(s.id)) || null;
}

module.exports = {
  getAllTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  renderTemplate,
  getNextSection,
  BUILT_IN_TEMPLATES,
};
