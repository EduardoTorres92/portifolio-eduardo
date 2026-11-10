// Recorta a pessoa de uma foto (fundo vira transparente) com o Vision do macOS, sem serviço pago.
// Uso (macOS 14 ou mais novo): swift fonte/recorta.swift fonte/retrato.png fonte/retrato-recorte.png
// Funciona melhor com fundo liso e escuro. Depois converta para WebP com alfa (900 px de largura) em
// public/img/kairo-perfil.webp. Em Windows/Linux, use qualquer removedor de fundo e siga do mesmo ponto.
import Vision
import CoreImage
import AppKit
let args = CommandLine.arguments
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
let ci = CIImage(contentsOf: inURL)!
let req = VNGenerateForegroundInstanceMaskRequest()
let h = VNImageRequestHandler(ciImage: ci)
try h.perform([req])
let obs = req.results!.first!
let mask = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: h)
let m = CIImage(cvPixelBuffer: mask)
let out = ci.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: CIImage.empty(), kCIInputMaskImageKey: m])
let ctx = CIContext()
try ctx.writePNGRepresentation(of: out, to: outURL, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("ok")
