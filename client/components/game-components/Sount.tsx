// components/AudioSource.tsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useLoader } from '@react-three/fiber'
import { AudioLoader } from 'three'

type Props = {
  position?: [number, number, number]
  url: string
}

export default function AudioSource({ position = [0, 0, 0], url }: Props) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera, scene } = useThree()

  const buffer = useLoader(AudioLoader, url)

  useEffect(() => {
    const listener = new THREE.AudioListener()
    camera.add(listener)

    const sound = new THREE.PositionalAudio(listener)
    sound.setBuffer(buffer)
    sound.setRefDistance(1) // adjust for range
    sound.setLoop(true)
    sound.setVolume(0.5)
    sound.play()

    if (meshRef.current) {
      meshRef.current.add(sound)
    }

    return () => {
      camera.remove(listener)
    }
  }, [buffer, camera])

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  )
}
