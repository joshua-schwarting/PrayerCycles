export type Locale = 'en' | 'de' | 'ja' | 'gsw' | 'mn'

export type Translations = {
  // App-wide
  appName: string
  close: string
  cancel: string
  save: string
  delete: string
  edit: string
  back: string
  add: string
  yes: string
  no: string
  loading: string

  // Bottom nav
  navPrayerLists: string
  navTimebox: string

  // Side menu
  exportImport: string
  deletedLists: string
  resetPrayerData: string
  languages: string
  privacyPolicy: string
  themes: string

  // Timer bar
  praying: string
  selectAList: string
  noOtherLists: string
  openMenu: string
  startTimer: string
  pauseTimer: string
  resetTimer: string
  autoToggleOnTooltip: string
  autoToggleOffTooltip: string

  // Tap Pray page

  // Lists page
  searchPrayers: string
  noListsYet: string
  deactivated: string
  expand: string
  noPrayersYet: string
  prayerCount: (count: number) => string

  // List detail page
  backToPrayerLists: string
  descriptionOptional: string
  active: string
  inactive: string
  activeTapToDeactivate: string
  deactivatedTapToReactivate: string
  deleteConfirm: string
  addPrayersPlaceholder: string
  addPrayersExample: string
  sortOriginal: string
  sortAZ: string
  sortZA: string
  noPrayersInList: string

  prayNow: string

  // Add modal
  newPrayerList: string
  newPrayer: string
  listName: string
  prayersOnePerLine: string
  prayersPlaceholder: string
  createList: string
  prayerTitle: string
  addPrayer: string
  noListsCreateFirst: string
  addToList: string
  moreOptions: string
  addDetails: string
  whoToPray: string
  listNameExample: string

  // Add wizard
  next: string
  stepOf: (current: number, total: number) => string
  qListName: string
  qWhoInList: string
  qAnythingElse: string
  qWhichList: string
  peopleHelp: string
  optionalStep: string
  prayersAndTags: string
  detailsTitle: string
  listDescriptionOptional: string

  // Prayer card

  // Prayer detail modal
  prayer: string
  addDescription: string
  deletePrayerConfirm: string

  // Export/Import
  exportImportTitle: string
  exportImportDesc: string
  exportBtn: string
  importBtn: string
  backupDownloaded: string
  exportFailed: string
  dataRestored: string
  importFailed: string

  // Timer page
  nowPraying: string
  selectAPrayerList: string
  noPrayersInThisList: string
  timePerPrayer: string
  totalTimebox: string
  positionOf: (current: number, total: number) => string
  autoAdjust: string
  upNext: string
  noPrayersInListYet: string
  pickRandomList: string

  // Trash page
  deletedListsTitle: string
  noDeletedLists: string
  restore: string
  daysUntilDeletion: (days: number) => string
  deletedListsDesc: string

  // History page

  // Total time prayed

  // Tags
  navPrayerTags: string
  prayerTags: string
  prayerTagsDesc: string
  noTagsYet: string
  tags: string
  tagsPlaceholder: string
  tagUsage: (lists: number, prayers: number) => string
  unscheduled: string
  createTag: string
  newTagPlaceholder: string
  filterByTags: string
  seeMore: string
  seeLess: string

  // Themes
  themeSlate: string
  themeNuudelchin: string
  themeAdelboden: string
  themeSakura: string
  themeNewSmyrna: string

  // Reset data
  resetAll: string
  resetAllDesc: string
  resetTags: string
  resetTagsDesc: string
  resetConfirmTap: string
  resetSuccess: string
}
