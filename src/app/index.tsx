import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useBluetooth } from '../hooks/useBluetooth';

const MIN_RPM = 0;
const MAX_RPM = 8000;

export default function Dashboard() {
  const {
    isEnabled,
    isScanning,
    isConnecting,
    devices,
    discoveredDevices,
    connectedDevice,
    batteryVoltage,
    actualRpm,
    isOvercurrent,
    errorMsg,
    requestEnable,
    startScan,
    connectDevice,
    disconnectDevice,
    sendRpm,
    setErrorMsg,
  } = useBluetooth();

  const [rpm, setRpm] = useState(0); // Target RPM controlled by slider
  const [modalVisible, setModalVisible] = useState(false);
  const [showOvercurrentModal, setShowOvercurrentModal] = useState(false);

  const lastSentRpm = useRef<number>(0);
  const lastSentTime = useRef<number>(0);

  // Throttled function to send RPM to the skateboard
  const throttledSendRpm = useCallback((targetRpm: number) => {
    if (!connectedDevice) return;
    const now = Date.now();
    // Send if 150ms passed, or if it is a boundary value (min/max)
    if (now - lastSentTime.current > 150 || targetRpm === MIN_RPM || targetRpm === MAX_RPM) {
      sendRpm(targetRpm);
      lastSentRpm.current = targetRpm;
      lastSentTime.current = now;
    }
  }, [connectedDevice, sendRpm]);

  // Keep Bluetooth updated when target RPM state changes
  useEffect(() => {
      if (connectedDevice) {
          throttledSendRpm(rpm);
          if (batteryVoltage < 22) {
              setRpm(0);
          }
    }
  }, [rpm, connectedDevice, throttledSendRpm]);

  // Zera o RPM imediatamente ao receber aviso de sobrecorrente
  useEffect(() => {
    if (isOvercurrent && connectedDevice) {
      console.log('[UI] Sobrecorrente detectada! Zerando RPM alvo e exibindo popup.');
      setRpm(0);
      sendRpm(0);
      setShowOvercurrentModal(true);
    }
  }, [isOvercurrent, connectedDevice, sendRpm]);

  const handleAccelerate = useCallback(() => {
    setRpm((prev) => {
      const next = Math.min(MAX_RPM, prev + 500);
      if (connectedDevice) {
        sendRpm(next);
        lastSentRpm.current = next;
        lastSentTime.current = Date.now();
      }
      return next;
    });
  }, [connectedDevice, sendRpm]);

  const handleBrake = useCallback(() => {
    setRpm((prev) => {
      const next = Math.max(MIN_RPM, prev - 600);
      if (connectedDevice) {
        sendRpm(next);
        lastSentRpm.current = next;
        lastSentTime.current = Date.now();
      }
      return next;
    });
  }, [connectedDevice, sendRpm]);

  const getRpmColor = (value: number) => {
    const pct = (value - MIN_RPM) / (MAX_RPM - MIN_RPM);
    if (pct < 0.4) return '#10B981'; // Emerald Green
    if (pct < 0.75) return '#F59E0B'; // Amber Orange
    return '#EF4444'; // Red
  };

  const getBatteryColor = (value: number) => {
    if (value > 24) return '#10B981';
    if (value > 21) return '#F59E0B';
    return '#EF4444';
  };

  const rpmPct = ((actualRpm - MIN_RPM) / (MAX_RPM - MIN_RPM)) * 100;
  const rpmColor = getRpmColor(actualRpm);
  const targetRpmColor = getRpmColor(rpm);
  const batteryColor = getBatteryColor(batteryVoltage);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F13" />
      <View style={styles.container}>

        {/* Header / Navigation Bar */}
        <View style={styles.headerBar}>
          <Text style={styles.header}>Painel do Skate</Text>

          {/* Bluetooth Status Badge */}
          <TouchableOpacity
            style={[
              styles.btBadge,
              connectedDevice
                ? styles.btBadgeConnected
                : isConnecting
                ? styles.btBadgeConnecting
                : styles.btBadgeDisconnected,
            ]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.btBadgeIcon}>
              {connectedDevice ? '🔗' : isConnecting ? '⚡' : '📶'}
            </Text>
            <Text style={styles.btBadgeText}>
              {connectedDevice
                ? connectedDevice.name || 'Conectado'
                : isConnecting
                ? 'Conectando...'
                : 'Conectar HC-05'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Telemetry Metrics Display */}
        <View style={styles.metricRow}>
          {/* RPM Display Card */}
          <View style={[styles.metricCard, { borderColor: rpmColor + '50' }]}>
            <Text style={styles.metricLabel}>RPM REAL</Text>
            <Text style={[styles.metricValue, { color: rpmColor }]}>
              {connectedDevice ? actualRpm.toLocaleString('pt-BR') : '---'}
            </Text>
            <Text style={styles.metricUnit}>rpm</Text>

            {/* Target RPM Subtext */}
            <View style={styles.targetRpmSubRow}>
              <Text style={styles.targetRpmSubLabel}>Alvo: </Text>
              <Text style={[styles.targetRpmSubValue, { color: targetRpmColor }]}>
                {rpm.toLocaleString('pt-BR')} rpm
              </Text>
            </View>

            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${connectedDevice ? Math.max(0, Math.min(100, rpmPct)) : 0}%`,
                    backgroundColor: rpmColor,
                  },
                ]}
              />
            </View>
          </View>

          {/* Battery Display Card */}
          <View style={[styles.metricCard, { borderColor: batteryColor + '50' }]}>
            <Text style={styles.metricLabel}>BATERIA</Text>
            <Text style={[styles.metricValue, { color: batteryColor }]}>
              {connectedDevice ? batteryVoltage.toFixed(1) : '---'}
            </Text>
            <Text style={styles.metricUnit}>V</Text>

            <View style={styles.targetRpmSubRow}>
              <Text style={styles.targetRpmSubLabel}>
                {connectedDevice ? 'Monitorando' : 'Sem conexão'}
              </Text>
            </View>

            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${connectedDevice ? Math.max(0, Math.min(100, (batteryVoltage / 29) * 100)) : 0}%`,
                    backgroundColor: batteryColor,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* RPM Slider Control Card */}
        <View style={styles.sliderCard}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Ajuste de Velocidade</Text>
            <Text style={[styles.sliderCurrent, { color: targetRpmColor }]}>
              {rpm.toLocaleString('pt-BR')} rpm
            </Text>
          </View>

          <View style={styles.presetRow}>
            {[
              { label: '0%', value: 0, color: '#4A4A5A' },
              { label: '25%', value: 25, color: '#3b82f6' },
              { label: '50%', value: 50, color: '#10b981' },
              { label: '75%', value: 75, color: '#f59e0b' },
              { label: '100%', value: 100, color: '#ef4444' }
            ].map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={[styles.presetBtn, { backgroundColor: preset.color }]}
                onPress={() => {
                  const targetVal = Math.round(MIN_RPM + (MAX_RPM - MIN_RPM) * (preset.value / 100));
                  setRpm(targetVal);
                  if (connectedDevice) {
                    sendRpm(targetVal);
                    lastSentRpm.current = targetVal;
                    lastSentTime.current = Date.now();
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.presetBtnText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Live Controller Buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnAccel]}
            onPress={handleAccelerate}
            activeOpacity={0.7}
          >
            <Text style={styles.btnIcon}>↑</Text>
            <Text style={styles.btnText}>Acelerar</Text>
            <Text style={styles.btnSubText}>+500 rpm</Text>
          </TouchableOpacity>

          <View style={styles.rightCol}>
            <TouchableOpacity
              style={[styles.btn, styles.btnBrake]}
              onPress={handleBrake}
              activeOpacity={0.7}
            >
              <Text style={styles.btnIcon}>↓</Text>
              <Text style={styles.btnText}>Frear</Text>
              <Text style={styles.btnSubText}>-600 rpm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnBrake]}
              onPress={() => {setRpm(0)}}
              activeOpacity={0.7}
            >
              <Text style={styles.btnIcon}>▀</Text>
              <Text style={styles.btnText}>Parar</Text>
              <Text style={styles.btnSubText}>FULL STOP</Text>
            </TouchableOpacity>
          </View>

        </View>

      </View>

      {/* Bluetooth Pairing & Connection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Conexão Bluetooth</Text>
                <Text style={styles.modalSubtitle}>Gerenciar pareamento com o skate</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  setErrorMsg(null);
                  setModalVisible(false);
                }}
              >
                <Text style={styles.modalCloseIcon}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Error Message Alert */}
            {errorMsg && (
              <View style={styles.errorAlert}>
                <Text style={styles.errorAlertText}>{errorMsg}</Text>
              </View>
            )}

            {/* Bluetooth State Banner */}
            {!isEnabled && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningBannerText}>
                  O Bluetooth está desativado no seu celular.
                </Text>
                {Platform.OS === 'android' && (
                  <TouchableOpacity
                    style={styles.warningBannerBtn}
                    onPress={requestEnable}
                  >
                    <Text style={styles.warningBannerBtnText}>Ativar</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Active Connection Panel */}
            {connectedDevice && (
              <View style={styles.activeConnectionPanel}>
                <View style={styles.activeConnectionDetails}>
                  <Text style={styles.activeLabel}>Conectado ao Skate</Text>
                  <Text style={styles.activeName}>{connectedDevice.name || 'HC-05'}</Text>
                  <Text style={styles.activeAddress}>{connectedDevice.address}</Text>
                </View>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={disconnectDevice}
                >
                  <Text style={styles.disconnectBtnText}>Desconectar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Device Lists */}
            <View style={styles.listContainer}>
              <View style={styles.listHeaderRow}>
                <Text style={styles.sectionTitle}>Dispositivos Disponíveis</Text>
                {isScanning ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <TouchableOpacity style={styles.scanBtn} onPress={startScan}>
                    <Text style={styles.scanBtnText}>Buscar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Combined devices list */}
              <ScrollView style={styles.listScroll} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Paired (Bonded) Devices */}
                <Text style={styles.subSectionTitle}>Pareados (Recomendado)</Text>
                {devices.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum dispositivo pareado encontrado.</Text>
                ) : (
                  devices.map((item) => (
                    <TouchableOpacity
                      key={item.address}
                      style={[
                        styles.deviceItem,
                        connectedDevice?.address === item.address && styles.deviceItemActive,
                      ]}
                      onPress={() => {
                        if (connectedDevice?.address !== item.address) {
                          connectDevice(item);
                        }
                      }}
                      disabled={isConnecting}
                    >
                      <View>
                        <Text style={styles.deviceName}>{item.name || 'Dispositivo Sem Nome'}</Text>
                        <Text style={styles.deviceAddress}>{item.address}</Text>
                      </View>
                      <Text style={styles.connectItemBtnText}>
                        {connectedDevice?.address === item.address ? 'Conectado' : 'Conectar'}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}

                {/* Discovered Unpaired Devices */}
                <Text style={[styles.subSectionTitle, { marginTop: 16 }]}>Novos Dispositivos</Text>
                {isScanning && discoveredDevices.length === 0 ? (
                  <View style={styles.scanningContainer}>
                    <ActivityIndicator size="small" color="#6B6B80" />
                    <Text style={styles.scanningText}>Buscando...</Text>
                  </View>
                ) : discoveredDevices.length === 0 ? (
                  <Text style={styles.emptyText}>Toque em "Buscar" para rastrear o HC-05.</Text>
                ) : (
                  discoveredDevices.map((item) => (
                    <TouchableOpacity
                      key={item.address}
                      style={styles.deviceItem}
                      onPress={() => connectDevice(item)}
                      disabled={isConnecting}
                    >
                      <View>
                        <Text style={styles.deviceName}>{item.name || 'Dispositivo Desconhecido'}</Text>
                        <Text style={styles.deviceAddress}>{item.address}</Text>
                      </View>
                      <Text style={styles.connectItemBtnText}>Parear & Conectar</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
      {/* Overcurrent Alert Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showOvercurrentModal}
        onRequestClose={() => {}}
      >
        <View style={styles.overcurrentOverlay}>
          <View style={styles.overcurrentContainer}>
            <View style={styles.overcurrentHeader}>
              <Text style={styles.overcurrentIcon}>⚠️</Text>
              <Text style={styles.overcurrentTitle}>SOBRECORRENTE</Text>
            </View>
            <Text style={styles.overcurrentText}>
              O skate reportou sobrecorrente e o motor foi parado por segurança.
            </Text>
            <TouchableOpacity
              style={styles.overcurrentBtn}
              onPress={() => setShowOvercurrentModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.overcurrentBtnText}>ENTENDI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0F0F13',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* Bluetooth Badge in top bar */
  btBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  btBadgeConnected: {
    backgroundColor: '#052E1C',
    borderColor: '#10B981',
  },
  btBadgeConnecting: {
    backgroundColor: '#2D1A05',
    borderColor: '#F59E0B',
  },
  btBadgeDisconnected: {
    backgroundColor: '#1E1E24',
    borderColor: '#3E3E4A',
  },
  btBadgeIcon: {
    fontSize: 12,
  },
  btBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  /* Metric cards */
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1A1A24',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B6B80',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 40,
  },
  metricUnit: {
    fontSize: 12,
    color: '#6B6B80',
    marginTop: 2,
    marginBottom: 6,
  },
  targetRpmSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  targetRpmSubLabel: {
    fontSize: 11,
    color: '#6B6B80',
  },
  targetRpmSubValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  barBg: {
    height: 4,
    backgroundColor: '#2A2A35',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },

  /* Slider */
  sliderCard: {
    backgroundColor: '#1A1A24',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A35',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    marginBottom: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#8888A0',
  },
  sliderCurrent: {
    fontSize: 14,
    fontWeight: '600',
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    height: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },

  /* Buttons */
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  rightCol: {
    flex: 1,
    gap: 12,
  },
  btn: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
  },
  btnAccel: {
    backgroundColor: '#052E1C',
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  btnBrake: {
    backgroundColor: '#2D0A0A',
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  btnIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 0,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  btnSubText: {
    fontSize: 10,
    color: '#8888A0',
    marginTop: 0,
  },

  /* Modal Layout */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    backgroundColor: '#161622',
    borderRadius: 28,
    maxHeight: '80%',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8888A0',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseIcon: {
    fontSize: 20,
    color: '#A0A0B8',
    lineHeight: 22,
  },

  /* Error Alert */
  errorAlert: {
    backgroundColor: '#4A1D1D',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorAlertText: {
    color: '#FCA5A5',
    fontSize: 13,
  },

  /* Warning Banner (Bluetooth Off) */
  warningBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#3E240D',
    borderWidth: 1,
    borderColor: '#F59E0B',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  warningBannerText: {
    color: '#FDE6C7',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  warningBannerBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  warningBannerBtnText: {
    color: '#0F0F13',
    fontWeight: '700',
    fontSize: 12,
  },

  /* Active Connection Row */
  activeConnectionPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F261D',
    borderWidth: 1,
    borderColor: '#10B981',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  activeConnectionDetails: {
    flex: 1,
  },
  activeLabel: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  activeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeAddress: {
    fontSize: 12,
    color: '#6B6B80',
    marginTop: 2,
  },
  disconnectBtn: {
    backgroundColor: '#EF444420',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  disconnectBtnText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },

  /* Lists section */
  listContainer: {
    flex: 1,
    minHeight: 280,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scanBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  listScroll: {
    flex: 1,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B6B80',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#4A4A5A',
    fontStyle: 'italic',
    paddingVertical: 8,
    paddingLeft: 4,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E2F',
    borderWidth: 1,
    borderColor: '#2D2D3F',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  deviceItemActive: {
    borderColor: '#10B981',
    backgroundColor: '#14251F',
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deviceAddress: {
    fontSize: 11,
    color: '#6B6B80',
    marginTop: 4,
  },
  connectItemBtnText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
  },
  scanningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 4,
  },
  scanningText: {
    color: '#6B6B80',
    fontSize: 13,
  },

  /* Overcurrent Modal Styles */
  overcurrentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overcurrentContainer: {
    backgroundColor: '#1E1E2F',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
  },
  overcurrentHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  overcurrentIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  overcurrentTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  overcurrentText: {
    color: '#E2E8F0',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  overcurrentBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  overcurrentBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
