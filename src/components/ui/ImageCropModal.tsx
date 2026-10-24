import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Image,
  PanResponder,
  useWindowDimensions,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { AppText } from './AppText';
import { AppButton } from './AppButton';

export interface CropData {
  originX: number;
  originY: number;
  width: number;
  height: number;
  rotate: number;
}

interface ImageCropModalProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onConfirm: (croppedUri: string, cropData?: CropData) => Promise<void> | void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  visible,
  imageUri,
  onClose,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const CROP_SIZE = Math.min(screenWidth - 48, 300);

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState<boolean>(false);

  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const positionRef = useRef({ x: 0, y: 0 });
  positionRef.current = position;

  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Effective rotated dimensions
  const isRotated90 = rotation % 180 !== 0;
  const naturalW = imageSize?.width || 800;
  const naturalH = imageSize?.height || 800;
  const rotW = isRotated90 ? naturalH : naturalW;
  const rotH = isRotated90 ? naturalW : naturalH;

  const ratio = rotW / rotH;
  const displayWidth = ratio >= 1 ? CROP_SIZE * ratio : CROP_SIZE;
  const displayHeight = ratio >= 1 ? CROP_SIZE : CROP_SIZE / ratio;

  // Clamping helper: keeps the photo covering the circular viewfinder at all times
  const clampX = (x: number, s: number) => {
    const maxX = Math.max(0, (displayWidth * s - CROP_SIZE) / 2);
    return Math.max(-maxX, Math.min(maxX, x));
  };

  const clampY = (y: number, s: number) => {
    const maxY = Math.max(0, (displayHeight * s - CROP_SIZE) / 2);
    return Math.max(-maxY, Math.min(maxY, y));
  };

  useEffect(() => {
    if (imageUri && visible) {
      setScale(1);
      scaleRef.current = 1;
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      positionRef.current = { x: 0, y: 0 };
      Image.getSize(
        imageUri,
        (w, h) => {
          setImageSize({ width: w, height: h });
        },
        () => {
          setImageSize({ width: 800, height: 800 });
        }
      );
    }
  }, [imageUri, visible]);

  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          initialDistanceRef.current = getDistance(evt.nativeEvent.touches);
          initialScaleRef.current = scaleRef.current;
        } else {
          panStartRef.current = { x: positionRef.current.x, y: positionRef.current.y };
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length === 2) {
          // Pinch-to-zoom
          if (!initialDistanceRef.current) {
            initialDistanceRef.current = getDistance(evt.nativeEvent.touches);
            initialScaleRef.current = scaleRef.current;
          } else {
            const currentDist = getDistance(evt.nativeEvent.touches);
            if (currentDist > 0 && initialDistanceRef.current > 0) {
              const factor = currentDist / initialDistanceRef.current;
              const newScale = Math.max(1, Math.min(3.5, initialScaleRef.current * factor));
              scaleRef.current = newScale;
              setScale(newScale);

              const clamped = {
                x: clampX(positionRef.current.x, newScale),
                y: clampY(positionRef.current.y, newScale),
              };
              positionRef.current = clamped;
              setPosition(clamped);
            }
          }
        } else if (evt.nativeEvent.touches.length === 1) {
          // Single-finger drag
          const targetX = panStartRef.current.x + gestureState.dx;
          const targetY = panStartRef.current.y + gestureState.dy;
          const clamped = {
            x: clampX(targetX, scaleRef.current),
            y: clampY(targetY, scaleRef.current),
          };
          positionRef.current = clamped;
          setPosition(clamped);
        }
      },
      onPanResponderRelease: () => {
        initialDistanceRef.current = null;
      },
      onPanResponderTerminate: () => {
        initialDistanceRef.current = null;
      },
    })
  ).current;

  const handleZoomIn = () => {
    setScale((prev) => {
      const next = Math.min(prev + 0.25, 3.5);
      scaleRef.current = next;
      const clamped = {
        x: clampX(positionRef.current.x, next),
        y: clampY(positionRef.current.y, next),
      };
      positionRef.current = clamped;
      setPosition(clamped);
      return next;
    });
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.25, 1);
      scaleRef.current = next;
      const clamped = {
        x: clampX(positionRef.current.x, next),
        y: clampY(positionRef.current.y, next),
      };
      positionRef.current = clamped;
      setPosition(clamped);
      return next;
    });
  };

  const handleRotate = () => {
    setRotation((prev) => {
      const next = (prev + 90) % 360;
      setPosition({ x: 0, y: 0 });
      positionRef.current = { x: 0, y: 0 };
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    scaleRef.current = 1;
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    positionRef.current = { x: 0, y: 0 };
  };

  const handleCropAndSave = async () => {
    if (!imageUri || processing) return;

    try {
      setProcessing(true);

      let natW = imageSize?.width;
      let natH = imageSize?.height;

      if (!natW || !natH) {
        const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          Image.getSize(
            imageUri,
            (width, height) => resolve({ width, height }),
            reject
          );
        }).catch(() => ({ width: 800, height: 800 }));
        natW = size.width;
        natH = size.height;
      }

      const normRotation = ((rotation % 360) + 360) % 360;
      const isRot = normRotation % 180 !== 0;
      const activeW = isRot ? natH : natW;
      const activeH = isRot ? natW : natH;

      // Base crop dimension (minimum dimension fills the crop window at scale = 1)
      const baseCropDim = Math.min(activeW, activeH);
      const cropDim = baseCropDim / scale;
      const pxPerScreen = cropDim / CROP_SIZE;

      let originX = Math.round((activeW - cropDim) / 2 - position.x * pxPerScreen);
      let originY = Math.round((activeH - cropDim) / 2 - position.y * pxPerScreen);
      let width = Math.round(cropDim);
      let height = Math.round(cropDim);

      // Boundary safety clamping
      originX = Math.max(0, Math.min(originX, activeW - width));
      originY = Math.max(0, Math.min(originY, activeH - height));

      const cropData: CropData = {
        originX,
        originY,
        width,
        height,
        rotate: normRotation,
      };

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        try {
          const croppedWebUri = await new Promise<string>((resolve) => {
            const img = new (window as any).Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                const targetSize = Math.min(width, 800);
                canvas.width = targetSize;
                canvas.height = targetSize;
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(imageUri);

                if (normRotation !== 0) {
                  ctx.translate(targetSize / 2, targetSize / 2);
                  ctx.rotate((normRotation * Math.PI) / 180);
                  ctx.translate(-targetSize / 2, -targetSize / 2);
                }

                ctx.drawImage(img, originX, originY, width, height, 0, 0, targetSize, targetSize);
                resolve(canvas.toDataURL('image/jpeg', 0.9));
              } catch (err) {
                resolve(imageUri);
              }
            };
            img.onerror = () => resolve(imageUri);
            img.src = imageUri;
          });
          await onConfirm(croppedWebUri, cropData);
          onClose();
          return;
        } catch (webErr) {
          console.log('Web canvas fallback:', webErr);
        }
      }

      await onConfirm(imageUri, cropData);
      onClose();
    } catch (e) {
      console.error('Error cropping image:', e);
      try {
        await onConfirm(imageUri);
      } catch (err) {}
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  if (!visible || !imageUri) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} disabled={processing}>
            <Ionicons name="close" size={24} color={Colors.ink} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <AppText variant="smallCaps" color={Colors.accent} style={{ letterSpacing: 2 }}>
              PHOTO EDITOR
            </AppText>
            <AppText variant="display" size={22} style={{ marginTop: 2 }}>
              Crop & Position
            </AppText>
          </View>
          <Pressable onPress={handleReset} style={styles.headerBtn} disabled={processing}>
            <AppText variant="mono" color={Colors.muted} style={{ fontSize: 11 }}>
              RESET
            </AppText>
          </Pressable>
        </View>

        {/* Viewfinder Area */}
        <View style={styles.viewfinderContainer}>
          <View
            style={[
              styles.cropWindow,
              { width: CROP_SIZE, height: CROP_SIZE, borderRadius: CROP_SIZE / 2 },
            ]}
            {...panResponder.panHandlers}
          >
            {/* Image Preview */}
            <View
              style={{
                width: CROP_SIZE,
                height: CROP_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={{
                  width: isRotated90 ? displayHeight : displayWidth,
                  height: isRotated90 ? displayWidth : displayHeight,
                  transform: [
                    { translateX: position.x },
                    { translateY: position.y },
                    { scale: scale },
                    { rotate: `${rotation}deg` },
                  ],
                }}
                resizeMode="cover"
              />
            </View>

            {/* Circular Vignette Border */}
            <View
              pointerEvents="none"
              style={[
                styles.cropOverlay,
                { width: CROP_SIZE, height: CROP_SIZE, borderRadius: CROP_SIZE / 2 },
              ]}
            >
              {/* Subtle 3x3 framing guide */}
              <View style={styles.gridH1} />
              <View style={styles.gridH2} />
              <View style={styles.gridV1} />
              <View style={styles.gridV2} />
            </View>
          </View>

          <AppText variant="serifItalic" color={Colors.muted} size={14} style={{ marginTop: 16 }}>
            Drag to reposition • Use controls below to zoom & rotate
          </AppText>
        </View>

        {/* Editing Toolbar */}
        <View style={styles.toolbar}>
          <Pressable onPress={handleZoomOut} style={styles.toolBtn} disabled={processing}>
            <Ionicons name="remove-circle-outline" size={26} color={Colors.ink} />
            <AppText variant="mono" style={styles.toolLabel}>ZOOM -</AppText>
          </Pressable>

          <View style={styles.scaleBadge}>
            <AppText variant="mono" size={13} color={Colors.ink}>
              {Math.round(scale * 100)}%
            </AppText>
          </View>

          <Pressable onPress={handleZoomIn} style={styles.toolBtn} disabled={processing}>
            <Ionicons name="add-circle-outline" size={26} color={Colors.ink} />
            <AppText variant="mono" style={styles.toolLabel}>ZOOM +</AppText>
          </Pressable>

          <Pressable onPress={handleRotate} style={styles.toolBtn} disabled={processing}>
            <Ionicons name="refresh-outline" size={24} color={Colors.ink} />
            <AppText variant="mono" style={styles.toolLabel}>ROTATE</AppText>
          </Pressable>
        </View>

        {/* Bottom Actions */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <AppButton
            variant="outline"
            size="md"
            onPress={onClose}
            disabled={processing}
            style={{ flex: 1 }}
          >
            Cancel
          </AppButton>

          <AppButton
            variant="solid"
            size="md"
            onPress={handleCropAndSave}
            disabled={processing}
            style={{ flex: 2, backgroundColor: Colors.ink }}
          >
            {processing ? 'Cropping...' : '✓ Use This Photo'}
          </AppButton>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  headerBtn: {
    padding: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  viewfinderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  cropWindow: {
    backgroundColor: Colors.cream2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropOverlay: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  gridH1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridV1: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gridV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: Colors.cream,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  toolBtn: {
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  toolLabel: {
    fontSize: 10,
    color: Colors.muted,
  },
  scaleBadge: {
    backgroundColor: Colors.bone,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: Colors.bone,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
});
