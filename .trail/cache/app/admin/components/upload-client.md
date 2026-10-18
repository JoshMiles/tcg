# app/admin/components/upload-client.ts

- UploadPhase · type · L3-L3 — type UploadPhase = 'uploading' | 'optimizing';
- uploadImageFile · function · L11-L26 — async function uploadImageFile(file: File, onPhase?: (phase: UploadPhase) => void): Promise<string>
- uploadAudioFile · function · L29-L31 — async function uploadAudioFile(file: File): Promise<string>
- postFile · function · L33-L41 — async function postFile(file: File, onPhase?: (phase: UploadPhase) => void): Promise<string>
