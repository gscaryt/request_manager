// House-style sections, in the exact order the final letter uses.
// Middle-pane grouping AND letter order are the same axis — one list drives both.
const sections = [
  {
    "id": "files",
    "label": "Files & formatting"
  },
  {
    "id": "abstract",
    "label": "Abstract & editor's summary"
  },
  {
    "id": "authors",
    "label": "Author information"
  },
  {
    "id": "structure",
    "label": "Article structure"
  },
  {
    "id": "maintext",
    "label": "Main text"
  },
  {
    "id": "figures",
    "label": "Figures & tables"
  },
  {
    "id": "data",
    "label": "Data & code availability"
  },
  {
    "id": "methods",
    "label": "Methods"
  },
  {
    "id": "endmatter",
    "label": "End matter (declarations)"
  },
  {
    "id": "supplementary",
    "label": "Supplementary information"
  },
  {
    "id": "tpr",
    "label": "Third-party permissions"
  },
  {
    "id": "sourcedata",
    "label": "Source data"
  },
  {
    "id": "reporting",
    "label": "Reporting Summary"
  },
  {
    "id": "forms",
    "label": "Forms & files to upload"
  }
];

// Small generic EXAMPLE library so the app works out of the box.
// A journal's real Master Library is distributed as a "Library ....json" file
// (Setup > Export library file) and imported by each editor — it is not code.
// `groups` = which tab(s) show a request: ea (assistant editor) | editor.
// [bracketed] tokens are editor fill-ins.
const seedTemplates = [
  {
    "id": "ms_format",
    "section": "files",
    "title": "Manuscript not Word/LaTeX",
    "body": "The main manuscript file is required to be in Microsoft Word or LaTeX format. Please provide your article file accordingly.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "author_checklist",
    "section": "reporting",
    "title": "Author Checklist missing/blank",
    "body": "Please ensure an updated Author Checklist is completed and uploaded as a 'related manuscript' file. All relevant elements of the checklist should be addressed.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "abstract_length",
    "section": "abstract",
    "title": "Abstract over 200 words",
    "body": "Please shorten the abstract to 200 words or fewer.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "abstract_refs",
    "section": "abstract",
    "title": "References in abstract",
    "body": "Please remove references from the abstract.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "editor_summary",
    "section": "abstract",
    "title": "Editor's summary to confirm",
    "body": "Your paper will be accompanied by the following editor's summary. Please let us know if there are any inaccuracies: '[insert editor's summary]'.",
    "groups": [
      "editor"
    ]
  },
  {
    "id": "affiliation_check",
    "section": "authors",
    "title": "Confirm names/affiliations/titles",
    "body": "We ask that you consult with your coauthors to ensure that all names, affiliations, and titles are represented correctly. Note that if any authors are added or removed after this point, all authors will be requested to provide approval documentation that could delay production of your paper.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "corresponding_email",
    "section": "authors",
    "title": "Corresponding author email missing",
    "body": "Please supply a single email address for each corresponding author on the title page. There must be at least one corresponding author.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "section_order",
    "section": "structure",
    "title": "Section order incorrect",
    "body": "Please ensure your main manuscript file includes the following sections, in this order: Title, Author list, Affiliations, Abstract, Introduction, Results, Discussion (optional), Methods, Data Availability, Code Availability (if relevant), References, Acknowledgements, Author Contributions Statement, Competing Interests Statement, Tables, Figure Legends.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "subjective_language",
    "section": "maintext",
    "title": "Subjective / novelty language",
    "body": "Please refrain from using words such as new/novel/first/unique/innovative when referring to the scientific findings, as novelty should be deducible from context. Please also remove exaggerated or subjective language such as 'extremely', 'outstanding', 'fascinating', 'pave the way', 'to the best of our knowledge', etc.",
    "groups": [
      "editor"
    ]
  },
  {
    "id": "figure_legend_title",
    "section": "figures",
    "title": "Figure legend/title missing",
    "body": "All figure legends must include a brief title that summarises the whole figure, be presented below the figure, may be up to 350 words, and must refer to all panels. Any abbreviations, symbols or colours must be defined in the legend.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "tables_editable",
    "section": "figures",
    "title": "Table not editable",
    "body": "Table [number] has been provided in a format that is not editable. Tables must be editable and prepared using the table menu in Word or the table environment in LaTeX.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "data_code_separate",
    "section": "data",
    "title": "Data & Code combined",
    "body": "The Data Availability and Code Availability statements must be included in separate sections, with the Code Availability section placed after the Data Availability section.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "methods_detail",
    "section": "methods",
    "title": "Insufficient Methods detail",
    "body": "Sufficient details of the experiments must be provided in the Methods section such that they could be reproduced without reference to published papers. Use of the term 'as described previously' is not encouraged.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "competing_interests",
    "section": "endmatter",
    "title": "Competing interests statement",
    "body": "A 'Competing interests' declaration must appear in your manuscript. It must refer to all authors and declare both financial and non-financial interests. Acceptable declarations include: 'The Authors declare no competing interests.' or 'The Authors declare the following competing interestsâ¦'. Please ensure the statement is identical in the manuscript and the tracking system.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "si_single_pdf",
    "section": "supplementary",
    "title": "SI not a single separate PDF",
    "body": "All Supplementary Information items (Supplementary Figures, Tables, Methods, Notes, Discussion, References) must be included in one PDF document, provided separately from the manuscript file. Only Supplementary Data, Movie, Software and Audio files should be submitted separately.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "tpr_permission",
    "section": "tpr",
    "title": "Third-party content / permissions",
    "body": "We note suspected third-party content in [figure]. Were these images and every element created by you and/or your co-authors? If material is from a database or previously published, please supply proof of permission for its use (receipt, express permission, confirmation of a compatible Open Access licence or Public Domain), and place the appropriate credit line in the relevant figure legend.",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "source_data",
    "section": "sourcedata",
    "title": "Source Data files",
    "body": "Please supply Source Data files for all data presented in graphs within the Figures and Supplementary Figures, in an acceptable format (.XLSX or .ZIP). Each figure/table's data should be a single sheet/file. Label the file 'Source Data', mention it in the relevant figure legends ('Source data are provided as a Source Data file.'), and add to the Data Availability section: 'Source data are provided with this paper.'",
    "groups": [
      "ea"
    ]
  },
  {
    "id": "file_size",
    "section": "forms",
    "title": "File size over 30MB",
    "body": "Unless otherwise stated, please limit individual file sizes to approximately 30MB. We strongly encourage the use of repositories for large datasets or source data.",
    "groups": [
      "ea"
    ]
  }
];

const DEFAULT_INTRO = "Please check the items below carefully and add a response in each row of the table to indicate the changes that you have made. Should you believe any point is not applicable to your manuscript, mark it as \"non-applicable\" and briefly explain why if possible.";

// The whole first-run Master Library, built from the code seed above.
export function seedMasterLibrary() {
  return {
    name: "Example journal",
    intro: DEFAULT_INTRO,
    sections: structuredClone(sections),
    requests: structuredClone(seedTemplates)
  };
}

export { sections, seedTemplates, DEFAULT_INTRO };
