import { TaskStatus, VerificationType, VerificationOutcome, LocalityType, FinalStatus, AddressLocatable, AddressRating, HouseStatus, Relation, WorkingStatus, StayingStatus, DocumentShownStatus, DocumentType, TPCConfirmation, TPCMetPerson, SightStatus, PoliticalConnection, DominatedArea, FeedbackFromNeighbour, RoomStatusShifted, MetPersonStatusShifted, PremisesStatus, MetPersonErt, MetPersonConfirmationErt, ApplicantStayingStatusErt, CallRemarkUntraceable, ResiCumOfficeStatus, RelationResiCumOffice, BusinessStatusResiCumOffice, BusinessLocation, LocalityTypeResiCumOffice, AddressTraceable, BusinessStatusErtResiCumOffice, OfficeStatusOffice, DesignationOffice, WorkingStatusOffice, ApplicantWorkingPremisesOffice, OfficeType, DesignationShiftedOffice, OfficeExistence, OfficeStatusErtOffice, BusinessType, OwnershipTypeBusiness, AddressStatusBusiness, PremisesStatusBusiness, BusinessExistence, ApplicantExistence, OfficeStatusErtBusiness, DesignationNoc, OfficeStatusErtNoc, OfficeStatusErtDsa, BuildingStatusApf, FlatStatusApf, RelationshipApf, RevokeReason, PropertyStatus, ConnectorStatus } from './enums';


// Enums for Residence Report Form
// Unified Final Status enum for all form types
// Enums for Shifted Residence Report
// DEPRECATED: Use FinalStatus instead
// export enum FinalStatusShifted - Now using unified FinalStatus enum

// Enums for Entry Restricted Residence Report
// Enums for Untraceable Residence Report
// DEPRECATED: Use FinalStatus instead
// export enum FinalStatusUntraceable - Now using unified FinalStatus enum

// Enums for Positive Resi-cum-Office Report
// Enums for Positive Office Report
// Enums for Shifted Office Report
// DEPRECATED: Use FinalStatus instead
// export enum FinalStatusShiftedOffice - Now using unified FinalStatus enum

// Enums for NSP Office Report
// Enums for ERT Office Report
// Enums for Positive Business Report
// Enums for Shifted Business Report
// DEPRECATED: Use FinalStatus instead
// export enum FinalStatusShiftedBusiness - Now using unified FinalStatus enum

// Enums for NSP Business Report
// Enums for ERT Business Report
// Enums for NOC Report
// Enums for ERT DSA/DST Report
// Enums for Property APF Report
export interface CapturedImage {
  id: string;
  dataUrl?: string; // Optional: Only for initial capture/watermarking
  localEncryptedPath?: string; // NEW: Path to AES-256 encrypted file
  latitude: number;
  longitude: number;
  timestamp: string;
  componentType?: 'photo' | 'selfie'; // Added to distinguish between regular photos and selfies for auto-save
  geoLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: string;
    address?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    locationIntegrity?: 'TRUSTED' | 'SUSPICIOUS' | 'SPOOFED';
  };
  locationIntegrity?: 'TRUSTED' | 'SUSPICIOUS' | 'SPOOFED';
  // Browser optimization properties
  compressed?: boolean;
  compressedData?: string;
  type?: string;
  originalSize?: number;
  compressedSize?: number;
  metadata?: any;
  metadataStatus?: 'PENDING' | 'SUCCESS' | 'FAILED';
  processingStatus?: 'QUEUED' | 'PROCESSING' | 'READY';
  capturedAtUtc?: number;
  deviceTime?: number;
  localPath?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'pdf' | 'image';
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/jpg' | 'image/png';
  size: number; // Size in bytes (max 10MB = 10485760 bytes)
  url: string;
  localEncryptedPath?: string; // NEW: AES-256 encrypted file path
  thumbnailUrl?: string; // For images only
  uploadedAt: string; // ISO timestamp
  uploadedBy: string;
  taskId?: string;
  formSubmissionId?: string;
  metadataStatus?: 'PENDING' | 'SUCCESS' | 'FAILED';
  processingStatus?: 'QUEUED' | 'PROCESSING' | 'READY';
  capturedAtUtc?: number;
  deviceTime?: number;
  localPath?: string;
  locationIntegrity?: 'TRUSTED' | 'SUSPICIOUS' | 'SPOOFED';
  location_confidence?: string;
  description?: string;
  metadata?: any;
}

export interface ResidenceReportData {
  addressLocatable: AddressLocatable | null;
  addressRating: AddressRating | null;
  houseStatus: HouseStatus | null;
  metPersonName: string;
  metPersonRelation: Relation | null;
  totalFamilyMembers: number | null;
  totalEarning: number | null;
  workingStatus: WorkingStatus | null;
  companyName: string;
  stayingPeriod: string;
  stayingStatus: StayingStatus | null;
  approxArea: number | null;
  documentShownStatus: DocumentShownStatus | null;
  documentType: DocumentType | null;
  tpcMetPerson1: TPCMetPerson | null;
  tpcName1: string;
  tpcConfirmation1: TPCConfirmation | null;
  tpcMetPerson2: TPCMetPerson | null;
  tpcName2: string;
  tpcConfirmation2: TPCConfirmation | null;
  locality: LocalityType | null;
  addressStructure: string;
  applicantStayingFloor: string;
  addressStructureColor: string;
  doorColor: string;
  doorNamePlateStatus: SightStatus | null;
  nameOnDoorPlate: string;
  societyNamePlateStatus: SightStatus | null;
  nameOnSocietyBoard: string;
  landmark1: string;
  landmark2: string;
  politicalConnection: PoliticalConnection | null;
  dominatedArea: DominatedArea | null;
  feedbackFromNeighbour: FeedbackFromNeighbour | null;
  otherObservation: string;
  finalStatus: FinalStatus | null;
  holdReason: string;
  images: CapturedImage[];
  selfieImages: CapturedImage[];
}

export interface ShiftedResidenceReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    roomStatus: RoomStatusShifted | null;
    metPersonName: string;
    metPersonStatus: MetPersonStatusShifted | null;
    shiftedPeriod: string;
    tpcMetPerson1: TPCMetPerson | null;
    tpcName1: string;
    tpcMetPerson2: TPCMetPerson | null;
    tpcName2: string;
    premisesStatus: PremisesStatus | null;
    locality: LocalityType | null;
    addressStructure: string;
    addressFloor: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspResidenceReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    houseStatus: HouseStatus | null;
    // Fields for when HouseStatus is 'Opened'
    metPersonName: string;
    metPersonStatus: MetPersonStatusShifted | null;
    stayingPeriod: string;
    tpcMetPerson1: TPCMetPerson | null;
    tpcName1: string;
    tpcMetPerson2: TPCMetPerson | null;
    tpcName2: string;
    // Field for when HouseStatus is 'Closed'
    stayingPersonName: string;
    // Common fields
    locality: LocalityType | null;
    addressStructure: string;
    applicantStayingFloor: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedResidenceReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    nameOfMetPerson: string;
    metPerson: MetPersonErt | null;
    metPersonConfirmation: MetPersonConfirmationErt | null;
    applicantStayingStatus: ApplicantStayingStatusErt | null;
    locality: LocalityType | null;
    addressStructure: string;
    applicantStayingFloor: string;
    addressStructureColor: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceableResidenceReportData {
    metPerson: string;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityType | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ResiCumOfficeReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    resiCumOfficeStatus: ResiCumOfficeStatus | null;
    residenceSetup: SightStatus | null;
    businessSetup: SightStatus | null;
    metPerson: string;
    relation: RelationResiCumOffice | null;
    stayingPeriod: string;
    stayingStatus: StayingStatus | null;
    companyNatureOfBusiness: string;
    businessPeriod: string;
    businessStatus: BusinessStatusResiCumOffice | null;
    businessLocation: BusinessLocation | null;
    businessOperatingAddress: string;
    approxArea: number | null;
    documentShownStatus: DocumentShownStatus | null;
    documentType: DocumentType | null;
    tpcMetPerson1: TPCMetPerson | null;
    tpcName1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    tpcName2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    applicantStayingFloor: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedResiCumOfficeReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    resiCumOfficeStatus: ResiCumOfficeStatus | null;
    metPerson: string;
    metPersonStatus: MetPersonStatusShifted | null;
    shiftedPeriod: string;
    tpcMetPerson1: TPCMetPerson | null;
    tpcName1: string;
    tpcMetPerson2: TPCMetPerson | null;
    tpcName2: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressFloor: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspResiCumOfficeReportData {
    addressTraceable: AddressTraceable | null;
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    resiCumOfficeStatus: ResiCumOfficeStatus | null;
    // Fields for when status is 'Open'
    metPerson: string;
    metPersonStatus: MetPersonStatusShifted | null;
    stayingPeriod: string;
    tpcMetPerson1: TPCMetPerson | null;
    tpcName1: string;
    tpcMetPerson2: TPCMetPerson | null;
    tpcName2: string;
    // Field for when status is 'Closed'
    stayingPersonName: string;
    // Common fields
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    applicantStayingFloor: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    dominatedArea: DominatedArea | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedResiCumOfficeReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    metPerson: MetPersonErt | null;
    nameOfMetPerson: string;
    metPersonConfirmation: MetPersonConfirmationErt | null;
    applicantStayingStatus: ApplicantStayingStatusErt | null;
    businessStatus: BusinessStatusErtResiCumOffice | null;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceableResiCumOfficeReportData {
    metPerson: string;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface PositiveOfficeReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationOffice | null;
    workingPeriod: string;
    applicantDesignation: DesignationOffice | null;
    workingStatus: WorkingStatusOffice | null;
    applicantWorkingPremises: ApplicantWorkingPremisesOffice | null;
    sittingLocation: string;
    officeType: OfficeType | null;
    companyNatureOfBusiness: string;
    staffStrength: number | null;
    staffSeen: number | null;
    officeApproxArea: number | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    documentShown: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    establishmentPeriod: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    outcome: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedOfficeReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    currentCompanyName: string;
    currentCompanyPeriod: string;
    oldOfficeShiftedPeriod: string;
    officeApproxArea: number | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    outcome: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspOfficeReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    officeExistence: OfficeExistence | null;
    currentCompanyName: string;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    outcome: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedOfficeReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    metPerson: MetPersonErt | null;
    nameOfMetPerson: string;
    metPersonConfirmation: TPCConfirmation | null;
    officeStatus: OfficeStatusErtOffice | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    officeExistFloor: string;
    addressStructureColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    outcome: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceableOfficeReportData {
    metPerson: string;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    outcome: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface PositiveBusinessReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    businessType: BusinessType | null;
    nameOfCompanyOwners: string;
    ownershipType: OwnershipTypeBusiness | null;
    addressStatus: AddressStatusBusiness | null;
    companyNatureOfBusiness: string;
    businessPeriod: string;
    officeApproxArea: number | null;
    staffStrength: number | null;
    staffSeen: number | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    documentShown: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedBusinessReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    premisesStatus: PremisesStatusBusiness | null;
    currentCompanyName: string;
    currentCompanyPeriod: string;
    oldOfficeShiftedPeriod: string;
    approxArea: number | null;
    tpcMetPerson: TPCMetPerson | null;
    nameOfTpc: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspBusinessReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    businessExistance: BusinessExistence | null;
    applicantExistance: ApplicantExistence | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    premisesStatus: PremisesStatusBusiness | null;
    currentCompanyName: string;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedBusinessReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    metPerson: MetPersonErt | null;
    nameOfMetPerson: string;
    metPersonConfirmation: TPCConfirmation | null;
    officeStatus: OfficeStatusErtBusiness | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceableBusinessReportData {
    metPerson: string;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface PositiveBuilderReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    businessType: BusinessType | null;
    nameOfCompanyOwners: string;
    ownershipType: OwnershipTypeBusiness | null;
    addressStatus: AddressStatusBusiness | null;
    companyNatureOfBusiness: string;
    businessPeriod: string;
    officeApproxArea: number | null;
    staffStrength: number | null;
    staffSeen: number | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    documentShown: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedBuilderReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    premisesStatus: PremisesStatusBusiness | null;
    currentCompanyName: string;
    currentCompanyPeriod: string;
    oldOfficeShiftedPeriod: string;
    approxArea: number | null;
    tpcMetPerson: TPCMetPerson | null;
    nameOfTpc: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspBuilderReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    businessExistance: BusinessExistence | null;
    applicantExistance: ApplicantExistence | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    premisesStatus: PremisesStatusBusiness | null;
    currentCompanyName: string;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedBuilderReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    metPerson: MetPersonErt | null;
    nameOfMetPerson: string;
    metPersonConfirmation: TPCConfirmation | null;
    officeStatus: OfficeStatusErtBusiness | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceableBuilderReportData {
    metPerson: string;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherExtraRemark: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface PositiveNocReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationNoc | null;
    authorisedSignature: string;
    nameOnNoc: string;
    flatNo: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherExtraRemark: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedNocReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationNoc | null;
    currentCompanyName: string;
    currentCompanyPeriod: string;
    oldOfficeShiftedPeriod: string;
    officeApproxArea: number | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspNocReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    businessExistance: BusinessExistence | null;
    applicantExistance: ApplicantExistence | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    premisesStatus: PremisesStatusBusiness | null;
    currentCompanyName: string;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedNocReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    metPerson: MetPersonErt | null;
    nameOfMetPerson: string;
    metPersonConfirmation: TPCConfirmation | null;
    officeStatus: OfficeStatusErtNoc | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceableNocReportData {
    contactPerson: string;
    metPerson: string;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherExtraRemark: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface PositiveDsaReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    businessType: BusinessType | null;
    nameOfCompanyOwners: string;
    ownershipType: OwnershipTypeBusiness | null;
    addressStatus: AddressStatusBusiness | null;
    companyNatureOfBusiness: string;
    businessPeriod: string;
    officeApproxArea: number | null;
    staffStrength: number | null;
    staffSeen: number | null;
    activeClient: string;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedDsaReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    premisesStatus: PremisesStatusBusiness | null;
    currentCompanyName: string;
    currentCompanyPeriod: string;
    oldOfficeShiftedPeriod: string;
    approxArea: number | null;
    tpcMetPerson: TPCMetPerson | null;
    nameOfTpc: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspDsaReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    officeStatus: OfficeStatusOffice | null;
    businessExistance: BusinessExistence | null;
    applicantExistance: ApplicantExistence | null;
    metPerson: string;
    designation: DesignationShiftedOffice | null;
    premisesStatus: PremisesStatusBusiness | null;
    currentCompanyName: string;
    companyNamePlateStatus: SightStatus | null;
    nameOnBoard: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedDsaReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    metPerson: MetPersonErt | null;
    nameOfMetPerson: string;
    metPersonConfirmation: TPCConfirmation | null;
    officeStatus: OfficeStatusErtDsa | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    applicantStayingFloor: string;
    addressStructureColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceableDsaReportData {
    metPerson: string;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherExtraRemark: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface PositivePropertyApfReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    buildingStatus: BuildingStatusApf | null;
    flatStatus: FlatStatusApf | null;
    metPerson: string;
    relationship: RelationshipApf | null;
    propertyOwnerName: string;
    approxArea: number | null;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressExistAt: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    // Construction Stop fields
    activityStopReason?: string;
    projectName?: string;
    projectStartedDate?: string;
    projectCompletionDate?: string;
    totalWing?: string;
    totalFlats?: string;
    totalBuildingsInProject?: string;
    projectCompletionPercent?: string;
    staffStrength?: string;
    staffSeen?: string;
    nameOnBoard?: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspPropertyApfReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    buildingStatus: BuildingStatusApf | null;
    flatStatus: FlatStatusApf | null;
    propertyStatus: PropertyStatus | null;
    metPerson: string;
    personMet: string;
    designation: string;
    relationship: string | null;
    propertyOwnerName: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    // Construction Stop fields
    activityStopReason?: string;
    projectName?: string;
    projectStartedDate?: string;
    projectCompletionDate?: string;
    totalWing?: string;
    totalFlats?: string;
    totalBuildingsInProject?: string;
    projectCompletionPercent?: string;
    staffStrength?: string;
    staffSeen?: string;
    nameOnBoard?: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedPropertyApfReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    flatStatus: FlatStatusApf | null;
    metPerson: MetPersonErt | null;
    personMet: string;
    designation: string;
    nameOfMetPerson: string;
    propertyStatus: PropertyStatus | null;
    metPersonConfirmation: TPCConfirmation | null;
    propertyOwnerName: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    buildingStatus: BuildingStatusApf | null;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceablePropertyApfReportData {
    metPerson: string;
    personMet: string;
    designation: string;
    propertyStatus: PropertyStatus | null;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedPropertyApfReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    propertyStatus: PropertyStatus | null;
    metPerson: string;
    personMet: string;
    designation: string;
    shiftedPeriod: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface PositivePropertyIndividualReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    buildingStatus: BuildingStatusApf | null;
    flatStatus: FlatStatusApf | null;
    metPerson: string;
    relationship: RelationshipApf | null;
    propertyOwnerName: string;
    approxArea: number | null;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressExistAt: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface NspPropertyIndividualReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    buildingStatus: BuildingStatusApf | null;
    flatStatus: FlatStatusApf | null;
    propertyStatus: PropertyStatus | null;
    metPerson: string;
    personMet: string;
    designation: string;
    relationship: string | null;
    propertyOwnerName: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcConfirmation1: TPCConfirmation | null;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    tpcConfirmation2: TPCConfirmation | null;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    doorNamePlateStatus: SightStatus | null;
    nameOnDoorPlate: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface EntryRestrictedPropertyIndividualReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    flatStatus: FlatStatusApf | null;
    metPerson: MetPersonErt | null;
    personMet: string;
    designation: string;
    nameOfMetPerson: string;
    propertyStatus: PropertyStatus | null;
    metPersonConfirmation: TPCConfirmation | null;
    propertyOwnerName: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    societyNamePlateStatus: SightStatus | null;
    nameOnSocietyBoard: string;
    landmark1: string;
    landmark2: string;
    buildingStatus: BuildingStatusApf | null;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface ShiftedPropertyIndividualReportData {
    addressLocatable: AddressLocatable | null;
    addressRating: AddressRating | null;
    propertyStatus: PropertyStatus | null;
    metPerson: string;
    personMet: string;
    designation: string;
    shiftedPeriod: string;
    tpcMetPerson1: TPCMetPerson | null;
    nameOfTpc1: string;
    tpcMetPerson2: TPCMetPerson | null;
    nameOfTpc2: string;
    locality: LocalityTypeResiCumOffice | null;
    addressStructure: string;
    addressStructureColor: string;
    doorColor: string;
    landmark1: string;
    landmark2: string;
    politicalConnection: PoliticalConnection | null;
    dominatedArea: DominatedArea | null;
    feedbackFromNeighbour: FeedbackFromNeighbour | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}

export interface UntraceablePropertyIndividualReportData {
    metPerson: string;
    personMet: string;
    designation: string;
    propertyStatus: PropertyStatus | null;
    callRemark: CallRemarkUntraceable | null;
    locality: LocalityTypeResiCumOffice | null;
    landmark1: string;
    landmark2: string;
    landmark3: string;
    landmark4: string;
    dominatedArea: DominatedArea | null;
    otherObservation: string;
    finalStatus: FinalStatus | null;
    holdReason: string;
    images: CapturedImage[];
    selfieImages: CapturedImage[];
}


export interface VerificationTask {
  id: string;
  title: string;
  description: string;
  customer: {
    name: string;
    contact: string;
  };
  status: TaskStatus;
  taskStatus?: TaskStatus; // Task-level status (from verification_tasks table)
  isSaved: boolean;
  createdAt: string; // Task Assignment Date/Time
  updatedAt: string; // Last Update Date/Time
  inProgressAt?: string; // In Progress Date/Time
  savedAt?: string; // Save Date/Time
  completedAt?: string; // Completion Date/Time
  submissionStatus?: 'pending' | 'submitting' | 'success' | 'failed'; // Submission status for completed cases
  submissionError?: string; // Error message if submission failed
  lastSubmissionAttempt?: string; // Timestamp of last submission attempt

  // Revoke tracking fields
  isRevoked?: boolean; // Whether the task has been revoked by field user
  revokedAt?: string; // Timestamp when task was revoked
  revokedBy?: string; // Field user ID who revoked the task
  revokedByName?: string; // Field user name from JOIN
  revokeReason?: RevokeReason | string; // Reason for revoking the task

  // Enhanced fields for 13 required case fields from backend
  // Field 1: Customer Name (already available as customer.name)
  customerName?: string; // Direct field from backend

  // Field 2: Case ID
  caseId?: number; // Case ID from backend (same as businessCaseId)
  businessCaseId?: number; // Backend auto-increment case ID for display purposes
  verificationTaskId?: string; // UUID from backend
  taskNumber?: string; // Human-readable task numberUUID
  verificationTaskNumber?: string; // Verification Task Number (e.g., VT-000127)

  // Field 3: Client
  clientId?: number; // Client ID from backend
  clientName?: string; // Client name from backend JOIN
  clientCode?: string; // Client code from backend JOIN
  client?: {
    id: number; // Fixed: Use number to match backend
    name: string;
    code: string;
  };

  // Field 4: Product
  productId?: number; // Product ID from backend
  productName?: string; // Product name from backend JOIN
  productCode?: string; // Product code from backend JOIN
  product?: string | {
    id: number; // Fixed: Use number to match backend
    name: string;
    code: string;
  }; // Legacy field for backward compatibility

  // Field 5: Verification Type (already available)
  verificationType: VerificationType;
  verificationTypeId?: number; // Verification type ID from backend
  verificationTypeName?: string; // Verification type name from backend JOIN
  verificationTypeCode?: string; // Verification type code from backend JOIN

  // Field 6: Applicant Type (already available as applicantStatus)
  applicantType?: string; // Direct field from backend
  applicantStatus?: string; // Legacy field for backward compatibility

  // Field 7: Created By Backend User
  createdByBackendUser?: string; // Backend user ID
  createdByBackendUserName?: string; // Backend user name from JOIN
  createdByBackendUserEmail?: string; // Backend user email from JOIN

  // Field 8: Backend Contact Number (already available as systemContactNumber)
  backendContactNumber?: string; // Direct field from backend
  systemContactNumber?: string; // Legacy field for backward compatibility

  // Field 9: Assign to Field User
  assignedTo?: string; // Assigned user ID
  assignedToName?: string; // Assigned user name from JOIN
  assignedToFieldUser?: string; // Assigned field user name from backend
  assignedToEmail?: string; // Assigned user email from JOIN

  // Field 10: Priority (already available)
  priority?: number; // User-defined priority for In Progress cases (1, 2, 3, etc.)

  // Field 11: Trigger (already available)
  trigger?: string; // Direct field from backend

  // Field 12: Customer Calling Code (already available)
  customerCallingCode?: string; // Direct field from backend

  // Field 13: Address (already available as visitAddress)
  address?: string; // Direct field from backend
  addressStreet?: string; // Address street from backend
  addressCity?: string; // Address city from backend
  addressState?: string; // Address state from backend
  addressPincode?: string; // Address pincode from backend
  latitude?: number;
  longitude?: number;
  customerEmail?: string;
  customerPhone?: string;
  visitAddress?: string; // Legacy field for backward compatibility

  // Legacy fields maintained for backward compatibility
  bankName?: string;
  verificationOutcome: VerificationOutcome | null;
  order?: number;
  notes?: string;
  attachments?: Attachment[]; // Task attachments (PDFs and images, max 10 attachments, 10MB each)
  residenceReport?: ResidenceReportData;
  shiftedResidenceReport?: ShiftedResidenceReportData;
  nspResidenceReport?: NspResidenceReportData;
  entryRestrictedResidenceReport?: EntryRestrictedResidenceReportData;
  untraceableResidenceReport?: UntraceableResidenceReportData;
  resiCumOfficeReport?: ResiCumOfficeReportData;
  shiftedResiCumOfficeReport?: ShiftedResiCumOfficeReportData;
  nspResiCumOfficeReport?: NspResiCumOfficeReportData;
  entryRestrictedResiCumOfficeReport?: EntryRestrictedResiCumOfficeReportData;
  untraceableResiCumOfficeReport?: UntraceableResiCumOfficeReportData;
  positiveOfficeReport?: PositiveOfficeReportData;
  shiftedOfficeReport?: ShiftedOfficeReportData;
  nspOfficeReport?: NspOfficeReportData;
  entryRestrictedOfficeReport?: EntryRestrictedOfficeReportData;
  untraceableOfficeReport?: UntraceableOfficeReportData;
  positiveBusinessReport?: PositiveBusinessReportData;
  shiftedBusinessReport?: ShiftedBusinessReportData;
  nspBusinessReport?: NspBusinessReportData;
  entryRestrictedBusinessReport?: EntryRestrictedBusinessReportData;
  untraceableBusinessReport?: UntraceableBusinessReportData;
  positiveBuilderReport?: PositiveBuilderReportData;
  shiftedBuilderReport?: ShiftedBuilderReportData;
  nspBuilderReport?: NspBuilderReportData;
  entryRestrictedBuilderReport?: EntryRestrictedBuilderReportData;
  untraceableBuilderReport?: UntraceableBuilderReportData;
  positiveNocReport?: PositiveNocReportData;
  shiftedNocReport?: ShiftedNocReportData;
  nspNocReport?: NspNocReportData;
  entryRestrictedNocReport?: EntryRestrictedNocReportData;
  untraceableNocReport?: UntraceableNocReportData;
  positiveDsaReport?: PositiveDsaReportData;
  shiftedDsaReport?: ShiftedDsaReportData;
  nspDsaReport?: NspDsaReportData;
  entryRestrictedDsaReport?: EntryRestrictedDsaReportData;
  untraceableDsaReport?: UntraceableDsaReportData;
  positivePropertyApfReport?: PositivePropertyApfReportData;
  nspPropertyApfReport?: NspPropertyApfReportData;
  entryRestrictedPropertyApfReport?: EntryRestrictedPropertyApfReportData;
  untraceablePropertyApfReport?: UntraceablePropertyApfReportData;
  shiftedPropertyApfReport?: ShiftedPropertyApfReportData;
  positivePropertyIndividualReport?: PositivePropertyIndividualReportData;
  nspPropertyIndividualReport?: NspPropertyIndividualReportData;
  shiftedPropertyIndividualReport?: ShiftedPropertyIndividualReportData;
  entryRestrictedPropertyIndividualReport?: EntryRestrictedPropertyIndividualReportData;
  untraceablePropertyIndividualReport?: UntraceablePropertyIndividualReportData;
  dsaDstConnectorReport?: PositiveDsaReportData; // Alias for now as it's the same structure
}

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  role?: string;
  profilePhotoUrl?: string;
  profilePhoto?: string;
  employeeId?: string;
  designation?: string;
  department?: string;
  phone?: string;
}