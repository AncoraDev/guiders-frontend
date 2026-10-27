import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

describe('Avatar', () => {
  let fixture: ComponentFixture<Avatar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Avatar],
    }).compileComponents();

    fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('userId', 'alberto');
    fixture.componentRef.setInput('name', 'ALBERTO');
    fixture.componentRef.setInput('size', 'small');
  });

  it('enseña la inicial si la foto no carga', () => {
    fixture.componentRef.setInput('imageUrl', 'https://example.test/roto.jpg');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('A');
  });

  it('enseña la foto cuando la url es válida', () => {
    fixture.componentRef.setInput('imageUrl', 'https://example.test/foto.jpg');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(image.getAttribute('alt')).toBe('');
  });
});
