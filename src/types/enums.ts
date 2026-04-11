// Verification form enums - Ported from CRM-MOBILE/src/types/index.ts
// These match the exact enum values used across the CRM system

export enum TaskStatus {
  Pending = 'PENDING',
  Assigned = 'ASSIGNED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
  Revoked = 'REVOKED',
  // Local-only statuses (not sent by backend)
  Saved = 'SAVED',
  SubmittedPendingSync = 'SUBMITTED_PENDING_SYNC',
}

export enum VerificationType {
  Residence = 'Residence',
  ResidenceCumOffice = 'Residence-cum-office',
  Office = 'Office',
  Business = 'Business',
  Builder = 'Builder',
  NOC = 'NOC',
  Connector = 'DSA/DST & Connector',
  PropertyAPF = 'Property APF',
  PropertyIndividual = 'Property Individual',
  ResidenceCumOffice_Legacy = 'Residence-cum-Office', // Case variation
}

export enum VerificationOutcome {
  PositiveAndDoorLocked = 'Positive & Door Locked',
  ShiftedAndDoorLocked = 'Shifted & Door Lock',
  NSPAndDoorLocked = 'NSP & Door Lock',
  ERT = 'ERT',
  Untraceable = 'Untraceable',
  Positive = 'Positive',
  Shifted = 'Shifted',
  NSP = 'NSP',
  EntryRestricted = 'Entry Restricted',
}

export enum AddressLocatable {
  Easy = 'Easy to Locate',
  Difficult = 'Difficult to Locate',
  Poor = 'Poor to Locate',
}

export enum AddressRating {
  Good = 'Good',
  Shabby = 'Shabby',
  Poor = 'Poor',
}

export enum HouseStatus {
  Opened = 'Opened',
  Closed = 'Closed',
}

export enum Relation {
  Father = 'Father',
  Mother = 'Mother',
  Spouse = 'Spouse',
  Son = 'Son',
  Daughter = 'Daughter',
  Brother = 'Brother',
  Sister = 'Sister',
  Self = 'Self',
  Other = 'Other',
}

export enum WorkingStatus {
  Salaried = 'Salaried',
  SelfEmployed = 'Self Employed',
  HouseWife = 'House Wife',
  Retired = 'Retired',
  Unemployed = 'Unemployed',
  Student = 'Student',
  HousePerson = 'House Person',
  Professional = 'Professional (Doctor, Lawyer, etc.)',
}

export enum StayingStatus {
  SelfOwned = 'On a Self Owned Basis',
  Rented = 'On a Rental Basis',
  ParentalOwned = 'On a Parental Owned Basis',
  Relative = 'On a Relative Basis',
  Pagadi = 'On a Pagadi System',
  StaffQuarters = 'In the Staff Quarters',
  PayingGuest = 'As a Paying Guest',
  CompanyAccomodation = 'On a Company Accomodation',
  BachelorAccomodation = 'In the Bachelor Accommodation',
  Hostel = 'In the Hostel',
  // Legacy values
  Owned = 'On a Owned Basis',
  Rental = 'On a Rental Basis',
  CompanyProvided = 'Company Provided',
  PG = 'PG',
}

export enum DocumentShownStatus {
  Showed = 'Showed',
  DidNotShow = 'Did Not Showed Any Document',
  // Legacy values
  Yes = 'Yes - Document Shown',
  No = 'No - Document Not Shown',
}

export enum DocumentType {
  ElectricityBill = 'Electricity Bill',
  AadharCard = 'Adhar Card',
  PanCard = 'Pan Card',
  Passport = 'Passport',
  RentDeed = 'Rent Deed',
  GasBill = 'Gas Bill / Gas Book',
  RationCard = 'Ration Card',
  LeaveAndLicense = 'Leave and License',
  ElectionCard = 'Election Card',
  DrivingLicense = 'Driving License',
  Other = 'Other',
}

export enum TPCMetPerson {
  Neighbour = 'Neighbour',
  Watchman = 'Watchman',
  Security = 'Security',
  Colleague = 'Colleague',
  PanShopVendor = 'Pan Shop / Vendor',
  ShopKeeper = 'Shop Keeper',
  Other = 'Other',
}

export enum TPCConfirmation {
  Confirmed = 'Confirmed',
  NotConfirmed = 'Not Confirmed',
}

export enum LocalityType {
  Tower = 'Tower / Building',
  RowHouse = 'Row House',
  Bunglow = 'Bunglow',
  IndependentHouse = 'Independent House',
  Chawl = 'Chawl / Slum',
  PatraShed = 'Patra Shed',
  SingleHouse = 'Single House',
}

export enum SightStatus {
  Sighted = 'Sighted',
  NotSighted = 'As / Not Sighted',
}

export enum PoliticalConnection {
  Yes = 'Having Political Connection',
  No = 'Not Having Political Connection',
}

export enum DominatedArea {
  Yes = 'A Community Dominated',
  No = 'Not a Community Dominated',
}

export enum FeedbackFromNeighbour {
  Adverse = 'Adverse',
  NoAdverse = 'No Adverse',
}

export enum FinalStatus {
  Positive = 'Positive',
  Negative = 'Negative',
  Refer = 'Refer',
  Fraud = 'Fraud',
  Hold = 'Hold',
}

export enum PropertyStatus {
  Positive = 'Positive',
  NSP = 'NSP',
  Shifted = 'Shifted',
  Untraceable = 'Untraceable',
  EntryRestricted = 'Entry Restricted',
}

// Shifted Residence enums
export enum RoomStatusShifted {
  Opened = 'Opened',
  Closed = 'Closed',
}

export enum MetPersonStatusShifted {
  Owner = 'Owner',
  Tenant = 'Tenant',
}

export enum PremisesStatus {
  Vacant = 'Vacant',
  Rented = 'Rented',
}

// Entry Restricted enums
export enum MetPersonErt {
  Security = 'Security',
  Receptionist = 'Receptionist',
}

export enum MetPersonConfirmationErt {
  Confirmed = 'Confirmed',
  NotConfirmed = 'Not Confirmed',
}

export enum ApplicantStayingStatusErt {
  StayingAt = 'Applicant is Staying At',
  ShiftedFrom = 'Applicant is Shifted From',
  NoSuchPerson = 'No Such Person Staying At',
}

// Untraceable enums
export enum CallRemarkUntraceable {
  DidNotPickUp = 'Did Not Pick Up Call',
  SwitchedOff = 'Number is Switch Off',
  Unreachable = 'Number is Unreachable',
  RefusedToGuide = 'Refused to Guide Address',
}

// Resi-cum-Office enums
export enum ResiCumOfficeStatus {
  Open = 'Opened',
  Closed = 'Closed',
}

export enum RelationResiCumOffice {
  Self = 'Self',
  Mother = 'Mother',
  Father = 'Father',
  Wife = 'Wife',
  Son = 'Son',
  Daughter = 'Daughter',
  Sister = 'Sister',
  Brother = 'Brother',
  Aunty = 'Aunty',
  Uncle = 'Uncle',
  MotherInLaw = 'Mother in Law',
  FatherInLaw = 'Father in Law',
  DaughterInLaw = 'Daughter in Law',
  SisterInLaw = 'Sister in Law',
  BrotherInLaw = 'Brother in Law',
  Other = 'Other',
}

export enum BusinessStatusResiCumOffice {
  SelfEmployee = 'Self Employee',
  Proprietorship = 'Proprietorship',
  PartnershipFirm = 'Partnership Firm',
  NA = 'NA',
}

export enum BusinessLocation {
  SameAddress = 'At Same Address',
  DifferentAddress = 'From Different Address',
}

export enum LocalityTypeResiCumOffice {
  CommercialTower = 'Commercial Tower',
  ResidentialBuilding = 'Residential Building',
  OfficeBuilding = 'Office Building',
  Bunglow = 'Bunglow',
  ShopLine = 'Shop Line',
  RowHouse = 'Row House',
  SingleHouse = 'Single House',
  ChawlSlum = 'Chawl / Slum',
  PatraShed = 'Patra Shed',
  GalaGodown = 'Gala / Godown',
  TeaStall = 'Tea Stall',
  SharingOffice = 'Sharing Office',
  RoadSide = 'Road Side',
  GovtOffice = 'Govt. Office',
  Bank = 'Bank',
  Cabin = 'Cabin',
  TableSpace = 'Table Space',
}

export enum AddressTraceable {
  Traceable = 'Traceable',
  Untraceable = 'Untraceable',
}

export enum BusinessStatusErtResiCumOffice {
  OfficeExist = 'Office Exist At',
  OfficeDoesNotExist = 'Office Does Not Exist At',
  OfficeShifted = 'Office Shifted From',
}

// Office enums
export enum OfficeStatusOffice {
  Opened = 'Opened',
  Closed = 'Closed',
  Shifted = 'Shifted',
}

export enum DesignationOffice {
  Manager = 'Manager',
  Executive = 'Executive',
  Clerk = 'Clerk',
  Developer = 'Developer',
  Analyst = 'Analyst',
  Assistant = 'Assistant',
  Other = 'Other',
}

export enum WorkingStatusOffice {
  CompanyPayroll = 'Company Payroll',
  ThirdPartyPayroll = 'Third Party Payroll',
  ContractPayroll = 'Contract Payroll',
}

export enum OfficeType {
  PvtLtd = 'PVT. LTD. Company',
  Ltd = 'LTD. Company',
  LLP = 'LLP Company',
  Govt = 'Govt. Office',
  Proprietorship = 'Proprietorship Firm',
  Partnership = 'Partnership Firm',
  PublicLtd = 'Public Ltd. Company',
}

export enum ApplicantWorkingPremisesOffice {
  SameLocation = 'Same Location',
  DifferentLocation = 'Different Location',
}

export enum DesignationShiftedOffice {
  ApplicantSelf = 'Applicant Self',
  Reception = 'Reception',
  ReceptionSecurity = 'Reception Security',
  CompanySecurity = 'Company Security',
  ManagerHR = 'Manager / H.R.',
  SrOfficer = 'SR. Officer',
  Accountant = 'Accountant',
  Admin = 'Admin',
  OfficeStaff = 'Office Staff',
  Clerk = 'Clark',
  Principal = 'Principal',
  Other = 'Other',
}

export enum OfficeExistence {
  Exist = 'Exist',
  DoesNotExist = 'Does Not Exist',
}

export enum OfficeStatusErtOffice {
  OfficeExistAt = 'Office Exist At',
  OfficeDoesNotExistAt = 'Office Does Not Exist At',
  OfficeShiftedFrom = 'Office Shifted From',
}

// Business enums
export enum BusinessType {
  PvtLtd = 'PVT. LTD. Company',
  Ltd = 'LTD. Company',
  LLP = 'LLP Company',
  Proprietorship = 'Proprietorship Firm',
  Partnership = 'Partnership Firm',
}

export enum OwnershipTypeBusiness {
  Partners = 'Are Partners',
  Directors = 'Are Directors',
  Proprietor = 'Is Proprietor',
}

export enum AddressStatusBusiness {
  SelfOwned = 'On a Self Owned Basis',
  Rental = 'On a Rental Basis',
  Pagadi = 'On a Pagadi System',
  SharedWorkplace = 'In Share Work Place',
}

export enum PremisesStatusBusiness {
  Vacant = 'Vacant',
  RentedTo = 'Rented To',
  OwnedBy = 'Owned By',
}

export enum BusinessExistence {
  Exist = 'Exist',
  DoesNotExist = 'Does Not Exist',
}

export enum ApplicantExistence {
  Exist = 'Exist',
  DoesNotExist = 'Does Not Exist',
}

export enum OfficeStatusErtBusiness {
  Exist = 'Business Exist At',
  DoesNotExist = 'Business Does Not Exist At',
  Shifted = 'Business Shifted From',
}

// NOC enums
export enum DesignationNoc {
  Chairman = 'Chairman',
  Secretary = 'Secretary',
  Treasurer = 'Treasurer',
  SocietyManager = 'Society Manager',
  Proprietor = 'Proprietor',
  Partner = 'Partner',
  Director = 'Director',
  Tenant = 'Tenant',
  Other = 'Other',
}

export enum OfficeStatusErtNoc {
  Exist = 'Office Exist At',
  DoesNotExist = 'Office Does Not Exist At',
  Shifted = 'Office Shifted From',
}

export enum OfficeStatusErtDsa {
  Exist = 'Business Exist At',
  DoesNotExist = 'Business Does Not Exist At',
  Shifted = 'Business Shifted From',
}

// Property APF enums
export enum BuildingStatusApf {
  NewConstruction = 'New Construction',
  Redeveloped = 'Redeveloped Construction',
  UnderConstruction = 'Under Construction',
  VacantPlace = 'Vacant Place',
}

export enum FlatStatusApf {
  Opened = 'Open',
  Closed = 'Closed',
}

export enum RelationshipApf {
  Self = 'Self',
  Mother = 'Mother',
  Father = 'Father',
  Wife = 'Wife',
  Son = 'Son',
  Daughter = 'Daughter',
  Sister = 'Sister',
  Brother = 'Brother',
  Aunty = 'Aunty',
  Uncle = 'Uncle',
  MotherInLaw = 'Mother in Law',
  FatherInLaw = 'Father in Law',
  DaughterInLaw = 'Daughter in Law',
  SisterInLaw = 'Sister in Law',
  BrotherInLaw = 'Brother in Law',
  Other = 'Other',
}

export enum ConnectorStatus {
  Positive = 'Positive',
  NSP = 'NSP',
  Shifted = 'Shifted',
  Untraceable = 'Untraceable',
  EntryRestricted = 'Entry Restricted',
}
export enum RevokeReason {
  NotMyArea = 'Not my area',
  WrongPincode = 'Wrong pincode',
  NotWorking = 'Not working',
  LeftArea = 'Left area',
  WrongAddress = 'Wrong/incomplete address',
}
