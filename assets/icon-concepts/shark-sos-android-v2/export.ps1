$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
# Production export only: preserve ImageGen art; normalize size, alpha padding and launcher masks.
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
public static class SharkIconV2Export {
  static Bitmap Canvas(int size) { return new Bitmap(size, size, PixelFormat.Format32bppArgb); }
  static Graphics Paint(Bitmap b) {
    var g = Graphics.FromImage(b);
    g.Clear(Color.Transparent); g.SmoothingMode = SmoothingMode.AntiAlias;
    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
    return g;
  }
  static void Save(Bitmap b, string root, string name) { b.Save(Path.Combine(root,name),ImageFormat.Png); }
  static Bitmap Mask(Bitmap image, bool circle) {
    var b = Canvas(image.Width);
    using(var g=Paint(b)) using(var p=new GraphicsPath()) {
      float s=b.Width, d=s*0.44f;
      if(circle) p.AddEllipse(0,0,s,s);
      else { p.AddArc(0,0,d,d,180,90); p.AddArc(s-d,0,d,d,270,90); p.AddArc(s-d,s-d,d,d,0,90); p.AddArc(0,s-d,d,d,90,90); p.CloseFigure(); }
      g.SetClip(p); g.DrawImage(image,0,0,b.Width,b.Height);
    }
    return b;
  }
  static void Comparison(string root, Bitmap circle, Bitmap rounded) {
    using(var old=new Bitmap(Path.GetFullPath(Path.Combine(root,"../../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"))))
    using(var sheet=new Bitmap(960,620,PixelFormat.Format24bppRgb))
    using(var g=Graphics.FromImage(sheet))
    using(var ink=new SolidBrush(Color.FromArgb(21,63,83)))
    using(var muted=new SolidBrush(Color.FromArgb(66,101,116)))
    using(var heading=new Font("Malgun Gothic",24,FontStyle.Bold))
    using(var label=new Font("Malgun Gothic",13,FontStyle.Bold))
    using(var small=new Font("Malgun Gothic",10)) {
      g.Clear(Color.FromArgb(239,248,250)); g.InterpolationMode=InterpolationMode.HighQualityBicubic;
      g.DrawString("상어 SOS · 안드로이드 아이콘",heading,ink,32,24);
      g.DrawString("같은 상어, 프레임 없는 바다 배경 · 런처 모양별 미리보기",small,muted,35,73);
      Image[] images={old,circle,rounded}; string[] names={"현재 원형 아이콘","신규 · 원형","신규 · 둥근 사각형"};
      for(int k=0;k<3;k++) {
        int x=32+k*310;
        g.DrawString(names[k],label,ink,x,118); g.DrawImage(images[k],x+48,160,192,192);
        g.DrawString("작은 크기에서 확인",small,muted,x,386);
        int cursor=x;
        foreach(int n in new int[]{48,64,96}) {
          g.DrawImage(images[k],cursor,425+(96-n)/2,n,n);
          g.DrawString(n+" px",small,muted,cursor,535); cursor+=n+25;
        }
      }
      g.DrawString("신규 이미지는 전경 + 배경 합성 결과입니다. 실물 기기 캡처는 아닙니다.",small,muted,35,582);
      Save(sheet,root,"comparison.png");
    }
  }
  public static string Run(string root) {
    const int size=1024;
    using(var source=new Bitmap(Path.Combine(root,"source/foreground.png")))
    using(var water=new Bitmap(Path.Combine(root,"source/background.png")))
    using(var fg=Canvas(size)) using(var bg=Canvas(size)) using(var icon=Canvas(size)) {
      int minX=source.Width,minY=source.Height,maxX=0,maxY=0;
      for(int y=0;y<source.Height;y++) for(int x=0;x<source.Width;x++) if(source.GetPixel(x,y).A>=16) {
        minX=Math.Min(minX,x); minY=Math.Min(minY,y); maxX=Math.Max(maxX,x); maxY=Math.Max(maxY,y);
      }
      double cx=(minX+maxX)/2.0,cy=(minY+maxY)/2.0,radius=0;
      for(int y=minY;y<=maxY;y++) for(int x=minX;x<=maxX;x++) if(source.GetPixel(x,y).A>=16)
        radius=Math.Max(radius,Math.Sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy)));
      double scale=(size*32.5/108.0)/radius;
      using(var g=Paint(fg)) g.DrawImage(source,new RectangleF((float)(size/2.0-cx*scale),(float)(size/2.0-cy*scale),(float)(source.Width*scale),(float)(source.Height*scale)));
      using(var g=Paint(bg)) { g.Clear(water.GetPixel(0,0)); g.DrawImage(water,0,0,size,size); }
      // Android nominal viewport: central 72dp of the 108dp adaptive layers.
      float inset=size/6f,view=size*2f/3f;
      using(var g=Paint(icon)) {
        var dest=new RectangleF(0,0,size,size); var src=new RectangleF(inset,inset,view,view);
        g.DrawImage(bg,dest,src,GraphicsUnit.Pixel); g.DrawImage(fg,dest,src,GraphicsUnit.Pixel);
      }
      Save(fg,root,"foreground-1024.png"); Save(bg,root,"background-1024.png"); Save(icon,root,"icon-1024.png");
      using(var circle=Mask(icon,true)) using(var rounded=Mask(icon,false)) {
        Save(circle,root,"preview-circle.png"); Save(rounded,root,"preview-rounded-square.png");
        Comparison(root,circle,rounded);
      }
      int outside=0,edge=0; double maxR=0;
      for(int y=0;y<size;y++) for(int x=0;x<size;x++) {
        if(bg.GetPixel(x,y).A!=255 || icon.GetPixel(x,y).A!=255) throw new Exception("Background or complete icon is not fully opaque.");
        if(fg.GetPixel(x,y).A<16) continue;
        double r=Math.Sqrt((x-size/2.0)*(x-size/2.0)+(y-size/2.0)*(y-size/2.0)); maxR=Math.Max(maxR,r);
        if(r>size*33.0/108.0) outside++;
        if(x==0||y==0||x==size-1||y==size-1) edge++;
      }
      if(outside!=0 || edge!=0) throw new Exception("Foreground exceeds adaptive safe circle.");
      return "All deliverables: 1024x1024 PNG. Foreground alpha >=16: max radius "+maxR.ToString("F2")+"px; safe radius "+(size*33.0/108.0).ToString("F2")+"px; outside safe circle "+outside+"; opaque edge pixels "+edge+". Background and complete icon are opaque.\n";
    }
  }
}
'@
[SharkIconV2Export]::Run($PSScriptRoot) | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'validation.txt')
Get-Content -LiteralPath (Join-Path $PSScriptRoot 'validation.txt')
