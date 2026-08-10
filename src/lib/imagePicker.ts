import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

interface CaptureOptions {
  /** Fixed crop aspect ratio, e.g. [1, 1] for a square logo/avatar. Omit for a free-form crop. */
  aspect?: [number, number];
  /** Max width (px) the image is downsized to before upload — keeps large camera photos small. */
  maxWidth?: number;
  /** JPEG re-encode quality, 0–1. */
  quality?: number;
}

// Downsizes + re-encodes as JPEG so large camera/gallery photos never hit the
// network at full resolution.
async function processImage(uri: string, maxWidth: number, quality: number): Promise<PickedImage> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: result.uri, name: `photo_${Date.now()}.jpg`, type: "image/jpeg" };
}

/** Opens the camera with the native crop UI, returns a downsized JPEG, or null if cancelled/denied. */
export async function captureFromCamera(options: CaptureOptions = {}): Promise<PickedImage | null> {
  const { aspect, maxWidth = 1600, quality = 0.7 } = options;
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert("Camera permission needed", "Please allow camera access to take a photo.");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return processImage(result.assets[0].uri, maxWidth, quality);
}

/** Opens the photo library with the native crop UI, returns a downsized JPEG, or null if cancelled/denied. */
export async function captureFromLibrary(options: CaptureOptions = {}): Promise<PickedImage | null> {
  const { aspect, maxWidth = 1600, quality = 0.7 } = options;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert("Permission needed", "Please allow photo library access to choose a photo.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return processImage(result.assets[0].uri, maxWidth, quality);
}

/** Prompts to take a photo or pick from the library, with cropping baked in. Resolves null if the user cancels. */
export function pickImage(options: CaptureOptions & { title?: string } = {}): Promise<PickedImage | null> {
  const { title = "Add Photo", ...captureOptions } = options;
  return new Promise((resolve) => {
    Alert.alert(title, "Choose a source", [
      { text: "Take Photo", onPress: () => captureFromCamera(captureOptions).then(resolve) },
      { text: "Choose from Gallery", onPress: () => captureFromLibrary(captureOptions).then(resolve) },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}
